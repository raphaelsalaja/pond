import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Source } from "@pond/schema/db";
import { app, BrowserWindow, type Cookie, session, shell } from "electron";
import log from "electron-log/main.js";
import { getPrefs, setPrefs } from "../prefs";
import { harvesterFor } from "./harvest";
import { arenaProfileUrl, buildArenaListExpression } from "./harvest/arena";
import { harvestArenaListViaApi } from "./harvest/arena/api";
import {
  buildCosmosListExpression,
  COSMOS_LIST_URL,
  cosmosProfileUrl,
} from "./harvest/cosmos";
import { buildInstagramListExpression } from "./harvest/instagram";
import type { ListHarvestArgs, ListHarvestResult } from "./harvest/list-types";
import {
  buildPinterestListExpression,
  pinterestProfileUrl,
} from "./harvest/pinterest";
import {
  buildTiktokListExpression,
  tiktokFavouritesUrl,
} from "./harvest/tiktok";
import {
  type BookmarksEntry,
  type BookmarksHarvestArgs,
  type BookmarksHarvestResult,
  buildBookmarksExpression,
  parseBookmarksResponses,
} from "./harvest/twitter";
import type { ScrapedHarvest } from "./harvest/types";
import {
  buildYoutubeListExpression,
  YOUTUBE_LIST_URLS,
} from "./harvest/youtube";
import { homeUrlForSource } from "./sources";

const PARTITION = "persist:pond-scrapers";
const NAV_TIMEOUT_MS = 25_000;
const HARVEST_TIMEOUT_MS = 20_000;

export const POOL_SIZE = 3;

interface PoolSlot {
  win: BrowserWindow;
  busy: boolean;
}

const pool: PoolSlot[] = [];
const waitQueue: Array<(slot: PoolSlot) => void> = [];

function createHiddenWindow(): BrowserWindow {
  const persistent = session.fromPartition(PARTITION);
  persistent.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  );

  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 1024,
    webPreferences: {
      session: persistent,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, "../preload/scrape.cjs"),
      plugins: false,
      webgl: false,
      autoplayPolicy: "document-user-activation-required",
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.setAudioMuted(true);
  win.on("closed", () => {
    const idx = pool.findIndex((s) => s.win === win);
    if (idx !== -1) pool.splice(idx, 1);
  });
  return win;
}

interface Lease {
  win: BrowserWindow;
  release: () => void;
}

async function leaseWindow(): Promise<Lease> {
  const idle = pool.find((s) => !s.busy && !s.win.isDestroyed());
  if (idle) {
    idle.busy = true;
    return {
      win: idle.win,
      release: () => {
        idle.busy = false;
        drainQueue();
      },
    };
  }
  if (pool.length < POOL_SIZE) {
    const win = createHiddenWindow();
    const slot: PoolSlot = { win, busy: true };
    pool.push(slot);
    return {
      win,
      release: () => {
        slot.busy = false;
        drainQueue();
      },
    };
  }
  return new Promise<Lease>((resolve) => {
    waitQueue.push((slot) => {
      slot.busy = true;
      resolve({
        win: slot.win,
        release: () => {
          slot.busy = false;
          drainQueue();
        },
      });
    });
  });
}

function drainQueue() {
  while (waitQueue.length > 0) {
    const idle = pool.find((s) => !s.busy && !s.win.isDestroyed());
    if (!idle) break;
    const next = waitQueue.shift();
    if (!next) break;
    next(idle);
  }
}

export interface HarvestArgs {
  url: string;
  source: Source | null;
  sourceId?: string;
}

export interface HarvestResult {
  ok: boolean;
  harvest?: ScrapedHarvest;
  sourceId?: string;
  reason?: "navigate_failed" | "harvest_failed" | "auth_required" | "timeout";
}

export async function harvestUrl(args: HarvestArgs): Promise<HarvestResult> {
  const lease = await leaseWindow();
  const harv = harvesterFor(args.source);
  const sourceId = args.sourceId ?? harv.sourceIdFromUrl(args.url) ?? "";

  try {
    const navOk = await navigateWithTimeout(
      lease.win,
      args.url,
      NAV_TIMEOUT_MS,
    );
    if (!navOk) {
      log.warn("[pond refresh:window] navigate failed", args.url);
      return { ok: false, reason: "navigate_failed", sourceId };
    }

    if (looksLikeAuthWall(lease.win.webContents.getURL())) {
      log.info(
        "[pond refresh:window] auth wall detected",
        lease.win.webContents.getURL(),
      );
      return { ok: false, reason: "auth_required", sourceId };
    }

    const expr = harv.buildExpression(sourceId);
    const raw = await Promise.race([
      lease.win.webContents.executeJavaScript(expr, true),
      sleep(HARVEST_TIMEOUT_MS).then(() => "__pond_harvest_timeout__"),
    ]);
    if (raw === "__pond_harvest_timeout__") {
      log.warn("[pond refresh:window] harvest timed out", args.url);
      return { ok: false, reason: "timeout", sourceId };
    }
    const harvest = harv.adapt(raw);
    if (!harvest) {
      return { ok: false, reason: "harvest_failed", sourceId };
    }
    return { ok: true, harvest, sourceId };
  } catch (err) {
    log.warn("[pond refresh:window] unexpected error", args.url, err);
    return { ok: false, reason: "harvest_failed", sourceId };
  } finally {
    lease.release();
  }
}

export interface SourceListArgs extends ListHarvestArgs {
  accountKey?: string;
}

export interface ListHarvestProgress {
  phase: string;
  collected: number;
  fresh: number;
}

export async function harvestSourceList(
  source: Source,
  args: SourceListArgs,
  opts: { onProgress?: (p: ListHarvestProgress) => void } = {},
): Promise<ListHarvestResult> {
  if (source === "arena") {
    if (!args.accountKey) {
      return { ok: false, reason: "auth_required" };
    }
    return harvestArenaListViaApi(args.accountKey, {
      knownIds: new Set(args.knownIds),
      onProgress: opts.onProgress
        ? (collected, fresh) =>
            opts.onProgress?.({ phase: "scroll", collected, fresh })
        : undefined,
    });
  }

  const target = listUrlForSource(source, args.accountKey);
  if (!target) {
    return { ok: false, reason: "no_match" };
  }
  const lease = await leaseWindow();
  try {
    const navOk = await navigateWithTimeout(lease.win, target, NAV_TIMEOUT_MS);
    if (!navOk) {
      return { ok: false, reason: "timeout" };
    }
    if (looksLikeAuthWall(lease.win.webContents.getURL())) {
      return { ok: false, reason: "auth_required" };
    }
    const expr = buildListExpressionFor(source, args);
    if (!expr) {
      return { ok: false, reason: "no_match" };
    }

    let stopPolling = false;
    let pollInterval: ReturnType<typeof setInterval> | null = null;
    if (opts.onProgress) {
      let lastCollected = -1;
      pollInterval = setInterval(() => {
        if (stopPolling) return;
        void lease.win.webContents
          .executeJavaScript(
            "JSON.stringify(globalThis.__pondHarvestStats ?? null)",
            true,
          )
          .then((raw: unknown) => {
            if (typeof raw !== "string" || raw === "null") return;
            try {
              const stats = JSON.parse(raw) as ListHarvestProgress;
              if (stats.collected !== lastCollected) {
                lastCollected = stats.collected;
                opts.onProgress?.(stats);
              }
            } catch {
              /* ignore */
            }
          })
          .catch(() => {});
      }, 1500);
    }

    const timeoutMs = source === "instagram" ? 300_000 : 90_000;
    const raw = await Promise.race([
      lease.win.webContents.executeJavaScript(expr, true),
      sleep(timeoutMs).then(() => "__pond_list_timeout__"),
    ]).finally(() => {
      stopPolling = true;
      if (pollInterval) clearInterval(pollInterval);
    });

    if (raw === "__pond_list_timeout__") {
      log.warn("[pond list]", source, "harvest timed out");
      return { ok: false, reason: "timeout" };
    }

    if (source === "cosmos" && process.env.POND_DUMP_COSMOS_CAPTURES) {
      await dumpCosmosCaptures(lease.win).catch((err) =>
        log.warn("[pond list:cosmos] capture dump failed", err),
      );
    }

    if (!raw || typeof raw !== "object") {
      return { ok: false, reason: "no_match" };
    }
    return raw as ListHarvestResult;
  } catch (err) {
    log.warn("[pond list]", source, "unexpected error", err);
    return { ok: false, reason: "unknown" };
  } finally {
    lease.release();
  }
}

function listUrlForSource(
  source: Source,
  accountKey: string | undefined,
): string | null {
  switch (source) {
    case "youtube":
      return YOUTUBE_LIST_URLS[0];
    case "cosmos":
      return accountKey ? cosmosProfileUrl(accountKey) : COSMOS_LIST_URL;
    case "arena":
      return accountKey ? arenaProfileUrl(accountKey) : null;
    case "pinterest":
      return accountKey ? pinterestProfileUrl(accountKey) : null;
    case "instagram":
      return "https://www.instagram.com/";
    case "tiktok":
      return accountKey ? tiktokFavouritesUrl(accountKey) : null;
    case "twitter":
    case "article":
      return null;
  }
}

function buildListExpressionFor(
  source: Source,
  args: ListHarvestArgs,
): string | null {
  switch (source) {
    case "youtube":
      return buildYoutubeListExpression(args);
    case "cosmos":
      return buildCosmosListExpression(args);
    case "arena":
      return buildArenaListExpression(args);
    case "pinterest":
      return buildPinterestListExpression(args);
    case "instagram":
      return buildInstagramListExpression(args);
    case "tiktok":
      return buildTiktokListExpression(args);
    case "twitter":
    case "article":
      return null;
  }
}

export async function harvestYoutubeLikedList(
  args: ListHarvestArgs,
): Promise<ListHarvestResult> {
  const lease = await leaseWindow();
  try {
    const navOk = await navigateWithTimeout(
      lease.win,
      YOUTUBE_LIST_URLS[1],
      NAV_TIMEOUT_MS,
    );
    if (!navOk) return { ok: false, reason: "timeout" };
    if (looksLikeAuthWall(lease.win.webContents.getURL())) {
      return { ok: false, reason: "auth_required" };
    }
    const expr = buildYoutubeListExpression(args);
    const raw = await Promise.race([
      lease.win.webContents.executeJavaScript(expr, true),
      sleep(90_000).then(() => "__pond_yt_ll_timeout__"),
    ]);
    if (raw === "__pond_yt_ll_timeout__") {
      return { ok: false, reason: "timeout" };
    }
    if (!raw || typeof raw !== "object") {
      return { ok: false, reason: "no_match" };
    }
    return raw as ListHarvestResult;
  } catch (err) {
    log.warn("[pond list] youtube LL unexpected error", err);
    return { ok: false, reason: "timeout" };
  } finally {
    lease.release();
  }
}

export interface BookmarksHarvestProgress {
  phase: "hydrate" | "scroll";
  seen: number;
  fresh: number;
  articles: number;
  captures: number;
  scrolls: number;
}

export async function harvestTwitterBookmarks(
  args: BookmarksHarvestArgs,
  opts: { onProgress?: (p: BookmarksHarvestProgress) => void } = {},
): Promise<BookmarksHarvestResult> {
  const lease = await leaseWindow();
  try {
    const navOk = await navigateWithTimeout(
      lease.win,
      "https://x.com/i/bookmarks",
      NAV_TIMEOUT_MS,
    );
    if (!navOk) return { ok: false, reason: "timeout" };
    if (looksLikeAuthWall(lease.win.webContents.getURL())) {
      return { ok: false, reason: "auth_required" };
    }
    const expr = buildBookmarksExpression(args);

    let lastSeen = -1;
    let lastPhase: BookmarksHarvestProgress["phase"] | null = null;
    let stopPolling = false;
    const pollInterval = setInterval(() => {
      if (stopPolling) return;
      void lease.win.webContents
        .executeJavaScript(
          "JSON.stringify(globalThis.__pondHarvestStats ?? null)",
          true,
        )
        .then((raw) => {
          if (typeof raw !== "string" || raw === "null") return;
          let stats: Omit<BookmarksHarvestProgress, "phase"> & {
            phase: "hydrate" | "scroll" | "done";
          };
          try {
            stats = JSON.parse(raw);
          } catch {
            return;
          }
          if (stats.phase === "done") return;
          const moved = stats.seen !== lastSeen || stats.phase !== lastPhase;
          if (!moved) return;
          lastSeen = stats.seen;
          lastPhase = stats.phase;
          opts.onProgress?.({
            phase: stats.phase,
            seen: stats.seen,
            fresh: stats.fresh,
            articles: stats.articles,
            captures: stats.captures,
            scrolls: stats.scrolls,
          });
        })
        .catch(() => {});
    }, 1500);

    const raw = await Promise.race([
      lease.win.webContents.executeJavaScript(expr, true),
      sleep(6 * 60_000).then(() => "__pond_bookmarks_timeout__"),
    ]).finally(() => {
      stopPolling = true;
      clearInterval(pollInterval);
    });
    if (raw === "__pond_bookmarks_timeout__") {
      log.warn("[pond bookmarks] harvest timed out");
      return { ok: false, reason: "timeout" };
    }
    if (!raw || typeof raw !== "object") {
      return { ok: false, reason: "no_match" };
    }
    const result = raw as BookmarksHarvestResult;
    if (!result.ok) return result;

    const rich = parseBookmarksResponses(result.captures);
    const seenTweetIds = new Set<string>();
    const merged: BookmarksEntry[] = [];
    for (const entry of result.entries) {
      if (seenTweetIds.has(entry.tweetId)) continue;
      seenTweetIds.add(entry.tweetId);
      const r = rich.get(entry.tweetId);
      if (!r) {
        merged.push(entry);
        continue;
      }
      const firstLine = r.fullText.split(/\n+/)[0]?.trim() ?? "";
      const richTitle =
        firstLine.length === 0
          ? entry.title
          : firstLine.length <= 90
            ? firstLine
            : `${firstLine.slice(0, 89).trimEnd()}…`;
      merged.push({
        ...entry,
        title: richTitle ?? entry.title,
        description: r.fullText || entry.description,
        author: r.author.handle ? `@${r.author.handle}` : entry.author,
        mediaUrls: r.media.length > 0 ? r.media : entry.mediaUrls,
        mediaUrl: r.media[0]?.url ?? entry.mediaUrl,
        rich: r,
      });
    }
    for (const [tweetId, r] of rich) {
      if (seenTweetIds.has(tweetId)) continue;
      seenTweetIds.add(tweetId);
      const firstLine = r.fullText.split(/\n+/)[0]?.trim() ?? "";
      const richTitle =
        firstLine.length === 0
          ? undefined
          : firstLine.length <= 90
            ? firstLine
            : `${firstLine.slice(0, 89).trimEnd()}…`;
      const richMediaUrls = r.media.length > 0 ? r.media : undefined;
      const entry: BookmarksEntry = {
        tweetId,
        url: r.url,
        ...(r.bookmarkedAt ? { bookmarkedAt: r.bookmarkedAt } : {}),
        ...(richTitle ? { title: richTitle } : {}),
        ...(r.fullText ? { description: r.fullText } : {}),
        ...(r.author.handle ? { author: `@${r.author.handle}` } : {}),
        ...(richMediaUrls ? { mediaUrls: richMediaUrls } : {}),
        ...(r.media[0]?.url ? { mediaUrl: r.media[0].url } : {}),
        rich: r,
      };
      merged.push(entry);
    }
    log.info(
      `[pond bookmarks] DOM=${result.entries.length} rich=${rich.size} merged=${merged.length} captures=${result.captures.length}`,
    );
    return {
      ok: true,
      entries: merged,
      captures: result.captures,
      reachedEnd: result.reachedEnd,
    };
  } catch (err) {
    log.warn("[pond bookmarks] unexpected error", err);
    return { ok: false, reason: "timeout" };
  } finally {
    lease.release();
  }
}

const PUBLIC_PROFILE_SOURCES = new Set<Source>(["cosmos", "arena"]);

export function isPublicProfileSource(source: Source): boolean {
  return PUBLIC_PROFILE_SOURCES.has(source);
}

export type SignInMode = "external" | "skipped";

export async function signInToSource(
  source: Source,
): Promise<{ ok: boolean; mode: SignInMode }> {
  if (PUBLIC_PROFILE_SOURCES.has(source)) {
    log.info(
      "[pond refresh:signin] public-profile source ignored",
      source,
      "(set the handle via prefs.sync.handles instead)",
    );
    return { ok: false, mode: "skipped" };
  }

  const url = homeUrlForSource(source);
  try {
    await shell.openExternal(url);
    log.info("[pond refresh:signin] opened external browser for", source, url);
    return { ok: true, mode: "external" };
  } catch (err) {
    log.warn("[pond refresh:signin] openExternal failed", source, err);
    return { ok: false, mode: "external" };
  }
}

function looksLikeAuthWall(currentUrl: string): boolean {
  try {
    const u = new URL(currentUrl);
    const p = u.pathname.toLowerCase();
    if (
      p.startsWith("/login") ||
      p.startsWith("/signin") ||
      p.startsWith("/sign-in") ||
      p.startsWith("/sign_in") ||
      p.startsWith("/i/flow/login") ||
      p.startsWith("/accounts/login") ||
      p.startsWith("/auth")
    ) {
      return true;
    }
    if (u.hostname.includes("accounts.google.com")) return true;
    return false;
  } catch {
    return false;
  }
}

async function navigateWithTimeout(
  win: BrowserWindow,
  url: string,
  timeoutMs: number,
): Promise<boolean> {
  const wc = win.webContents;
  const finished = new Promise<boolean>((resolve) => {
    const onDone = () => {
      cleanup();
      resolve(true);
    };
    const onFail = () => {
      cleanup();
      resolve(false);
    };
    const cleanup = () => {
      wc.off("did-finish-load", onDone);
      wc.off("did-fail-load", onFail);
    };
    wc.once("did-finish-load", onDone);
    wc.once("did-fail-load", onFail);
  });
  try {
    await wc.loadURL(url);
  } catch {
    return false;
  }
  const result = await Promise.race([
    finished,
    sleep(timeoutMs).then(() => false),
  ]);
  return result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function dumpCosmosCaptures(win: BrowserWindow): Promise<void> {
  const raw = await win.webContents.executeJavaScript(
    "JSON.stringify(globalThis.__pondCosmosCapturesArchive ?? [])",
    true,
  );
  if (typeof raw !== "string" || raw === "[]") {
    log.info("[pond list:cosmos] no captures to dump");
    return;
  }
  const dir = join(app.getPath("userData"), "cosmos-captures");
  await mkdir(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(dir, `${stamp}.json`);
  await writeFile(path, raw, "utf-8");
  log.info("[pond list:cosmos] dumped captures to", path);
}

export async function isSourceConnected(source: Source): Promise<boolean> {
  if (PUBLIC_PROFILE_SOURCES.has(source)) {
    const handle = await readStoredHandle(source);
    return handle !== null;
  }
  const cookies = await listCookiesForSource(source);
  return cookies.some((c) => isAuthCookie(source, c));
}

export async function writePartitionCookies(args: {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path?: string;
    secure?: boolean;
    httpOnly?: boolean;
    sameSite?: "unspecified" | "no_restriction" | "lax" | "strict";
    expirationDate?: number | null;
    hostOnly?: boolean;
  }>;
}): Promise<{ written: number; skipped: number }> {
  const persistent = session.fromPartition(PARTITION);
  let written = 0;
  let skipped = 0;
  for (const c of args.cookies) {
    const hostForUrl = c.domain.replace(/^\./, "");
    const url = `${c.secure === false ? "http" : "https"}://${hostForUrl}${c.path ?? "/"}`;
    try {
      await persistent.cookies.set({
        url,
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path ?? "/",
        secure: c.secure,
        httpOnly: c.httpOnly,
        sameSite: c.sameSite ?? "unspecified",
        expirationDate: c.expirationDate ?? undefined,
      });
      written += 1;
    } catch (err) {
      skipped += 1;
      log.warn(
        "[pond refresh:cookies] set failed",
        c.name,
        c.domain,
        err instanceof Error ? err.message : err,
      );
    }
  }
  return { written, skipped };
}

export async function readStoredHandle(source: Source): Promise<string | null> {
  try {
    const prefs = await getPrefs();
    const raw = prefs.sync.handles?.[source];
    if (typeof raw !== "string") return null;
    const trimmed = raw.trim().replace(/^@/, "");
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    log.warn("[pond refresh:signin] readStoredHandle failed", source, err);
    return null;
  }
}

function isAuthCookie(source: Source, cookie: Cookie): boolean {
  const name = cookie.name;
  switch (source) {
    case "twitter":
      return name === "auth_token";
    case "instagram":
      return name === "sessionid";
    case "tiktok":
      return name === "sessionid" || name === "sid_tt";
    case "pinterest":
      return name === "_pinterest_sess" || name === "_auth";
    case "youtube":
      return (
        name === "LOGIN_INFO" ||
        name === "SID" ||
        name === "__Secure-1PSID" ||
        name === "__Secure-3PSID"
      );
    case "cosmos":
    case "arena":
      return false;
    case "article":
      return false;
  }
}

async function listCookiesForSource(source: Source): Promise<Cookie[]> {
  const persistent = session.fromPartition(PARTITION);
  const domain = primaryDomainForSource(source);
  if (!domain) return [];
  try {
    return await persistent.cookies.get({ domain });
  } catch (err) {
    log.warn("[pond refresh:window] cookies.get failed", domain, err);
    return [];
  }
}

export function primaryDomainForSource(source: Source): string | null {
  switch (source) {
    case "twitter":
      return ".x.com";
    case "instagram":
      return ".instagram.com";
    case "cosmos":
      return ".cosmos.so";
    case "tiktok":
      return ".tiktok.com";
    case "pinterest":
      return ".pinterest.com";
    case "arena":
      return ".are.na";
    case "youtube":
      return ".youtube.com";
    case "article":
      return null;
  }
}

export async function disconnectSource(
  source: Source,
): Promise<{ ok: boolean }> {
  if (PUBLIC_PROFILE_SOURCES.has(source)) {
    try {
      const prefs = await getPrefs();
      const nextHandles = { ...prefs.sync.handles };
      delete nextHandles[source];
      await setPrefs({ sync: { handles: nextHandles } });
      return { ok: true };
    } catch (err) {
      log.warn("[pond refresh:disconnect] handle clear failed", source, err);
      return { ok: false };
    }
  }

  const persistent = session.fromPartition(PARTITION);
  const domain = primaryDomainForSource(source);
  if (!domain) return { ok: true };
  try {
    const cookies = await persistent.cookies.get({ domain });
    await Promise.all(
      cookies.map((c) => {
        const url = `${c.secure ? "https" : "http"}://${c.domain?.replace(/^\./, "") ?? domain.replace(/^\./, "")}${c.path ?? "/"}`;
        return persistent.cookies.remove(url, c.name).catch(() => {});
      }),
    );
    await persistent.clearStorageData({
      origin: `https://${domain.replace(/^\./, "")}`,
      storages: [
        "cookies",
        "localstorage",
        "indexdb",
        "websql",
        "serviceworkers",
      ],
    });
    return { ok: true };
  } catch (err) {
    log.warn("[pond refresh:window] disconnect failed", source, err);
    return { ok: false };
  }
}

export function disposeHiddenWindow(): void {
  for (const slot of pool) {
    if (!slot.win.isDestroyed()) slot.win.destroy();
  }
  pool.length = 0;
  waitQueue.length = 0;
}
