import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import type { Save } from "@pond/schema/db";
import type { WebContents } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import type { TransferOptions } from "../../../lib/download-transfer";
import { saveFile } from "../../../paths";
import { persistSave } from "../../persist-save";
import { getPrefs } from "../../prefs";
import {
  looksLikeAuthWall,
  navigateWithTimeout,
} from "../../refresh/harvest-window/navigation";
import { leaseWindow } from "../../refresh/harvest-window/pool";
import {
  type ImportableCookie,
  writePartitionCookies,
} from "../../refresh/harvest-window/session";
import { readLibraryMedia } from "../../storage/library-media-storage";
import { TransientError } from "../extractors/errors";
import {
  dropPageCookies,
  pageCookiePartition,
  peekPageCookies,
} from "../page-cookies";
import type { WriteFileArgs } from "./apply";
import { readSave } from "./apply";
import { WarcRecorder, withTimeout } from "./warc-recorder";

const ARCHIVE_MAX_PAGES = 25;
const ARCHIVE_MAX_DEPTH = 2;
const SETTLE_MS = 2_000;
/** Runtime data fetches (pricing APIs, deferred JSON) can trail the load event; the capture waits for this quiet gap so they land in the WARC. */
const NETWORK_QUIET_MS = 1_500;
const NETWORK_IDLE_BUDGET_MS = 10_000;
const MAX_PRELOAD_IMAGES = 400;
const MAX_MEDIA_PER_PAGE = 60;
const IMAGE_PRELOAD_BUDGET_MS = 45_000;
const PAGE_GAP_MS = 750;
const NAV_TIMEOUT_MS = 25_000;
const HARVEST_TIMEOUT_MS = 10_000;
const MAX_LINKS_PER_PAGE = 200;
const MAX_NAV_ATTEMPTS = 40;
const CRAWL_BUDGET_MS = 4 * 60_000;

const ARCHIVE_KIND = "archive";
const ARCHIVE_MANIFEST_KIND = "archive_manifest";
const ARCHIVE_MANIFEST_FILENAME = "archive-manifest.json";
const ARCHIVE_WARC_FILENAME = "archive.warc.gz";
export const ARCHIVE_VERSION = 9;

export type ArchiveScope = "page" | "site";

interface ArchiveManifestPage {
  url: string;
  title: string;
}

const StoredArchiveManifestSchema = z
  .object({
    version: z.number().optional().catch(undefined),
    scope: z.string().optional().catch(undefined),
  })
  .catch({});

interface ArchiveManifest {
  version: number;
  rootUrl: string;
  archivedAt: string;
  scope: ArchiveScope;
  pages: ArchiveManifestPage[];
}

export function hasWarcArchive(
  files: readonly { kind: string; path: string }[] | null | undefined,
): boolean {
  return (files ?? []).some(
    (f) => f.kind === ARCHIVE_KIND && f.path.endsWith(".warc.gz"),
  );
}

type ArchivePageSave = Pick<Save, "source" | "url" | "files">;

interface ArchivePageRuntime {
  readSave: (saveId: string) => Promise<ArchivePageSave | null>;
  autoArchive: () => Promise<boolean>;
  crawlSite: (
    rootUrl: URL,
    scope: ArchiveScope,
    signal: AbortSignal,
    opts?: {
      partition?: string;
      cookies?: ImportableCookie[] | null;
      reportActivity?: TransferOptions["reportActivity"];
    },
  ) => Promise<CrawlResult>;
  persistArchive: (saveId: string, files: WriteFileArgs[]) => Promise<void>;
}

async function autoArchiveFromPrefs(): Promise<boolean> {
  return (await getPrefs()).storage.autoArchive;
}

async function persistArchive(
  saveId: string,
  newFiles: WriteFileArgs[],
): Promise<void> {
  await persistSave(
    saveId,
    {},
    {
      actorReason: "pipeline:archive-page",
      newFiles,
      replaceFilesWithKind: [ARCHIVE_KIND, ARCHIVE_MANIFEST_KIND],
    },
  );
}

function defaultArchiveRuntime(): ArchivePageRuntime {
  return {
    readSave,
    autoArchive: autoArchiveFromPrefs,
    crawlSite,
    persistArchive,
  };
}

export async function readArchivedMeta(
  saveId: string,
): Promise<{ scope: ArchiveScope; version: number }> {
  try {
    const raw = (
      await readLibraryMedia(saveFile(saveId, ARCHIVE_MANIFEST_FILENAME))
    ).toString("utf8");
    const manifest = StoredArchiveManifestSchema.parse(JSON.parse(raw));
    return {
      scope: manifest.scope === "page" ? "page" : "site",
      version: manifest.version ?? 0,
    };
  } catch {
    return { scope: "site", version: 0 };
  }
}

export async function runArchivePage(
  saveId: string,
  payload: { scope?: ArchiveScope },
  ctx: TransferOptions & { signal: AbortSignal },
  runtime: ArchivePageRuntime = defaultArchiveRuntime(),
): Promise<void> {
  const scope: ArchiveScope = payload.scope === "site" ? "site" : "page";
  const save = await runtime.readSave(saveId);
  if (save?.source !== "web") {
    dropPageCookies(saveId);
    return;
  }

  if (scope !== "site" && !(await runtime.autoArchive())) {
    log.debug("[pond pipeline:archive-page] automatic archive off, skipping", {
      saveId,
    });
    dropPageCookies(saveId);
    return;
  }

  const cookies = peekPageCookies(saveId);
  const hasCookies = (cookies?.length ?? 0) > 0;

  if (hasWarcArchive(save.files)) {
    const archived = await readArchivedMeta(saveId);
    const upgrade = scope === "site" && archived.scope === "page";
    if (!upgrade && !hasCookies && archived.version >= ARCHIVE_VERSION) {
      log.debug("[pond pipeline:archive-page] already archived, skipping", {
        saveId,
        scope,
        archived,
      });
      dropPageCookies(saveId);
      return;
    }
  }

  let rootUrl: URL;
  try {
    rootUrl = new URL(save.url);
  } catch {
    dropPageCookies(saveId);
    return;
  }
  if (rootUrl.protocol !== "http:" && rootUrl.protocol !== "https:") {
    dropPageCookies(saveId);
    return;
  }

  const result = await runtime.crawlSite(rootUrl, scope, ctx.signal, {
    partition: hasCookies ? pageCookiePartition(saveId) : undefined,
    cookies,
    reportActivity: ctx.reportActivity,
  });
  if (result.pages.length === 0 || result.warcBytes.byteLength === 0) {
    throw new TransientError("archive_page: no pages captured");
  }

  const manifest: ArchiveManifest = {
    version: ARCHIVE_VERSION,
    rootUrl: rootUrl.href,
    archivedAt: new Date().toISOString(),
    scope,
    pages: result.pages,
  };

  log.info("[pond pipeline:archive-page] persisting archive", {
    saveId,
    pages: result.pages.length,
    bytes: result.warcBytes.byteLength,
  });
  const newFiles: WriteFileArgs[] = [
    {
      kind: ARCHIVE_MANIFEST_KIND,
      filename: ARCHIVE_MANIFEST_FILENAME,
      bytes: Buffer.from(JSON.stringify(manifest, null, 2), "utf8"),
      mimeType: "application/json",
    },
    {
      kind: ARCHIVE_KIND,
      filename: ARCHIVE_WARC_FILENAME,
      bytes: result.warcBytes,
      mimeType: "application/warc",
      sourceUrl: rootUrl.href,
    },
  ];

  await runtime.persistArchive(saveId, newFiles);
  log.info("[pond pipeline:archive-page] archived site", {
    saveId,
    pages: result.pages.length,
    bytes: result.warcBytes.byteLength,
  });
  dropPageCookies(saveId);
}

interface CrawlResult {
  pages: ArchiveManifestPage[];
  warcBytes: Buffer;
}

async function crawlSite(
  rootUrl: URL,
  scope: ArchiveScope,
  signal: AbortSignal,
  opts: {
    partition?: string;
    cookies?: ImportableCookie[] | null;
    reportActivity?: TransferOptions["reportActivity"];
  } = {},
): Promise<CrawlResult> {
  const maxPages = scope === "site" ? ARCHIVE_MAX_PAGES : 1;
  const maxDepth = scope === "site" ? ARCHIVE_MAX_DEPTH : 0;
  const started = Date.now();
  const deadline = started + CRAWL_BUDGET_MS;
  const elapsed = () => Date.now() - started;
  log.info("[pond pipeline:archive-page] crawl start", {
    url: rootUrl.href,
    scope,
    cookies: opts.cookies?.length ?? 0,
  });
  const leaseOptions: Parameters<typeof leaseWindow>[1] = {
    signal,
    reportActivity: opts.reportActivity,
  };
  if (opts.partition) leaseOptions.partition = opts.partition;
  const lease = await leaseWindow("web", leaseOptions);
  log.info("[pond pipeline:archive-page] window leased", { ms: elapsed() });
  const tmpDir = await mkdtemp(join(tmpdir(), "pond-archive-"));
  const warcPath = join(tmpDir, ARCHIVE_WARC_FILENAME);
  const pages: ArchiveManifestPage[] = [];
  const capturedKeys = new Set<string>();
  const queued = new Set<string>([dedupeKey(rootUrl.href)]);
  const queue: Array<{ url: string; depth: number }> = [
    { url: rootUrl.href, depth: 0 },
  ];

  let recorder: WarcRecorder | null = null;
  let navAttempts = 0;
  try {
    /** A never-loaded window has no renderer process, so CDP commands never resolve; boot one before attaching the debugger. */
    if (!lease.win.webContents.getURL()) {
      await withTimeout(lease.win.loadURL("about:blank"), HARVEST_TIMEOUT_MS);
    }
    /**
     * Persisted caches (SWR-in-localStorage, site service workers) satisfy runtime data fetches without touching the network, leaving holes that crash the replayed page.
     * Cookies stay: source syncs rely on logged-in scrape sessions.
     */
    await lease.win.webContents.session.clearStorageData({
      origin: rootUrl.origin,
      storages: ["localstorage", "indexdb", "cachestorage", "serviceworkers"],
    });
    if (opts.partition && opts.cookies && opts.cookies.length > 0) {
      await lease.win.webContents.session.clearStorageData({
        storages: ["cookies"],
      });
      const written = await writePartitionCookies({
        cookies: opts.cookies,
        partition: opts.partition,
      });
      log.info("[pond pipeline:archive-page] page cookies written", {
        written: written.written,
        skipped: written.skipped,
      });
    }
    recorder = await WarcRecorder.start(lease.win.webContents, warcPath);
    log.info("[pond pipeline:archive-page] recorder started", {
      ms: elapsed(),
    });

    while (queue.length > 0 && pages.length < maxPages) {
      if (signal.aborted) break;
      if (navAttempts >= MAX_NAV_ATTEMPTS) break;
      if (Date.now() >= deadline) break;
      const next = queue.shift();
      if (!next) break;

      navAttempts += 1;
      if (pages.length > 0) await sleep(PAGE_GAP_MS);
      const navOk = await navigateWithTimeout(
        lease.win,
        next.url,
        NAV_TIMEOUT_MS,
      );
      if (!navOk) {
        log.info("[pond pipeline:archive-page] nav failed", {
          url: next.url,
          ms: elapsed(),
        });
        continue;
      }
      await sleep(SETTLE_MS);
      await autoScroll(lease.win.webContents);
      await preloadImages(lease.win.webContents);
      await recorder.waitForNetworkIdle(
        NETWORK_QUIET_MS,
        NETWORK_IDLE_BUDGET_MS,
      );
      await recorder.captureFullBodies(
        await collectMediaUrls(lease.win.webContents),
      );
      await recorder.flush();

      const wc = lease.win.webContents;
      const finalUrl = wc.getURL();
      const finalKey = dedupeKey(finalUrl);
      if (capturedKeys.has(finalKey)) continue;
      if (looksLikeAuthWall(finalUrl)) continue;

      const harvest = await harvestPage(wc);
      if (!harvest) {
        log.info("[pond pipeline:archive-page] harvest failed", {
          url: finalUrl,
          ms: elapsed(),
        });
        continue;
      }

      pages.push({ url: finalUrl, title: harvest.title });
      capturedKeys.add(finalKey);
      log.info("[pond pipeline:archive-page] page captured", {
        url: finalUrl,
        pages: pages.length,
        ms: elapsed(),
      });

      if (next.depth >= maxDepth) continue;
      for (const href of harvest.links) {
        const normalized = normalizeLink(href, rootUrl);
        if (!normalized) continue;
        const key = dedupeKey(normalized);
        if (queued.has(key)) continue;
        queued.add(key);
        queue.push({ url: normalized, depth: next.depth + 1 });
      }
    }
  } finally {
    if (recorder) {
      try {
        await recorder.stop();
      } catch (err) {
        log.warn("[pond pipeline:archive-page] recorder stop failed", err);
      }
    }
    lease.release();
    log.info("[pond pipeline:archive-page] crawl done", {
      pages: pages.length,
      navAttempts,
      ms: elapsed(),
    });
  }

  let warcBytes = Buffer.alloc(0);
  try {
    warcBytes = await readFile(warcPath);
  } catch {
  } finally {
    void rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
  return { pages, warcBytes };
}

async function preloadImages(wc: WebContents): Promise<void> {
  const expr = `(async () => {
    const urls = new Set();
    const addSrcset = (v) => {
      if (!v) return;
      for (const part of v.split(",")) {
        const u = part.trim().split(/\\s+/)[0];
        if (u) urls.add(u);
      }
    };
    for (const el of document.querySelectorAll("img, source")) {
      const src = el.getAttribute("src") || el.getAttribute("data-src");
      if (src) urls.add(src);
      addSrcset(el.getAttribute("srcset"));
      addSrcset(el.getAttribute("data-srcset"));
    }
    for (const el of document.querySelectorAll("video[poster]")) {
      urls.add(el.getAttribute("poster"));
    }
    for (const sheet of document.styleSheets) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      for (const rule of rules) {
        const text = rule.cssText || "";
        for (const m of text.matchAll(/url\\((['"]?)([^'")]+)\\1\\)/g)) {
          if (/\\.(png|jpe?g|gif|webp|avif|svg)(\\?|$)/i.test(m[2])) {
            urls.add(m[2]);
          }
        }
      }
    }
    const list = [...urls].slice(0, ${MAX_PRELOAD_IMAGES});
    const loadOne = (u) =>
      new Promise((resolve) => {
        const img = new Image();
        img.onload = img.onerror = () => resolve(undefined);
        setTimeout(resolve, 8000);
        try {
          img.src = new URL(u, document.baseURI).href;
        } catch {
          resolve(undefined);
        }
      });
    for (let i = 0; i < list.length; i += 8) {
      await Promise.all(list.slice(i, i + 8).map(loadOne));
    }
    return list.length;
  })()`;
  try {
    await withTimeout(
      wc.executeJavaScript(expr, true),
      IMAGE_PRELOAD_BUDGET_MS,
    );
  } catch {}
}

const MediaUrlsSchema = z
  .array(z.unknown())
  .transform((items) =>
    items.flatMap((item) => z.string().safeParse(item).data ?? []),
  )
  .catch([]);

async function collectMediaUrls(wc: WebContents): Promise<string[]> {
  const expr = `(() => {
    const urls = new Set();
    for (const el of document.querySelectorAll("video, audio, video source, audio source")) {
      const src = el.currentSrc || el.src;
      if (src) urls.add(src);
    }
    return [...urls].slice(0, ${MAX_MEDIA_PER_PAGE});
  })()`;
  try {
    return MediaUrlsSchema.parse(
      await withTimeout(wc.executeJavaScript(expr, true), HARVEST_TIMEOUT_MS),
    );
  } catch {
    return [];
  }
}

async function autoScroll(wc: WebContents): Promise<void> {
  const expr = `(async () => {
    const step = window.innerHeight;
    const limit = Math.min(document.body?.scrollHeight ?? 0, step * 20);
    for (let y = 0; y <= limit; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
    }
    window.scrollTo(0, 0);
  })()`;
  try {
    await withTimeout(wc.executeJavaScript(expr, true), HARVEST_TIMEOUT_MS);
  } catch {}
}

const PageHarvestSchema = z.object({
  title: z.string().catch(""),
  links: z
    .array(z.unknown())
    .transform((items) =>
      items.flatMap((item) => z.string().safeParse(item).data ?? []),
    )
    .catch([]),
});

type PageHarvest = z.infer<typeof PageHarvestSchema>;

async function harvestPage(wc: WebContents): Promise<PageHarvest | null> {
  const expr = `(() => {
    const links = Array.from(document.querySelectorAll("a[href]"))
      .map((a) => a.href)
      .filter((h) => typeof h === "string" && h.length > 0);
    return {
      title: document.title || "",
      links: Array.from(new Set(links)).slice(0, ${MAX_LINKS_PER_PAGE}),
    };
  })()`;
  try {
    const raw = await withTimeout(
      wc.executeJavaScript(expr, true),
      HARVEST_TIMEOUT_MS,
    );
    return PageHarvestSchema.safeParse(raw).data ?? null;
  } catch {
    return null;
  }
}

const NON_PAGE_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".svg",
  ".ico",
  ".pdf",
  ".zip",
  ".gz",
  ".dmg",
  ".exe",
  ".mp4",
  ".webm",
  ".mov",
  ".mp3",
  ".wav",
  ".css",
  ".js",
  ".mjs",
  ".json",
  ".xml",
  ".rss",
  ".atom",
  ".woff",
  ".woff2",
  ".ttf",
]);

function normalizeLink(href: string, rootUrl: URL): string | null {
  let u: URL;
  try {
    u = new URL(href, rootUrl);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.hostname !== rootUrl.hostname) return null;
  u.hash = "";
  const path = u.pathname.toLowerCase();
  const dot = path.lastIndexOf(".");
  if (dot !== -1 && NON_PAGE_EXTENSIONS.has(path.slice(dot))) return null;
  return u.href;
}

function dedupeKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    const path = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.toLowerCase()}${path}${u.search}`;
  } catch {
    return url;
  }
}
