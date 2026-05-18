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

// Sized to comfortably cover the reconciler's `harvest_metadata` +
// `capture_tweet` per-op caps plus a slack window for occasional
// list-harvest / bookmark sync calls. Each hidden window is ~150 MB
// resident; six windows is the comfortable upper bound on a laptop
// without leaning on swap.
export const POOL_SIZE = 6;

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
  source: Source;
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

export interface TweetScreenshotArgs {
  url: string;
  sourceId: string;
  // Forces the captured tweet's color scheme. Defaults to "dark" so the
  // pre-dual-theme behaviour is preserved for any caller that hasn't
  // been updated.
  colorScheme?: "light" | "dark";
}

export interface TweetScreenshotResult {
  ok: boolean;
  png?: { bytes: Buffer; width: number; height: number };
  reason?: "navigate_failed" | "auth_required" | "no_article" | "timeout";
}

const SCREENSHOT_ARTICLE_TIMEOUT_MS = 12_000;

// 3x of the article's CSS-pixel rect. Electron's `capturePage` captures
// at the WebContents' device scale factor, and the hidden pool window
// inherits the primary display's DPR (typically 1 or 2). Override it via
// CDP so captures look sharp regardless of the host display.
const CAPTURE_DEVICE_SCALE_FACTOR = 3;

// Vertical breathing room added below the article when we resize the
// window to fit it. Without padding, lazy-loaded media in the last image
// row can poke into the bottom edge.
const SCREENSHOT_VERTICAL_PADDING = 40;

// Absolute cap on hidden-window content height. Tweets with huge
// embedded carousels can otherwise drive the window past safe limits;
// anything beyond this just gets cropped at the bottom (rare).
const SCREENSHOT_MAX_HEIGHT = 8192;

// screenshotTweet — opens the tweet in a hidden window, finds the
// rendered <article>, and captures just that element via
// `webContents.capturePage(rect)`. Reuses the same window pool / cookies
// as `harvestUrl`, so logged-in tweets work when the X integration is
// connected. Returns `ok: false` for any failure — callers should treat
// misses as a no-op and fall back to whatever they were rendering
// before (we never want a screenshot miss to mark a save as failed).
export async function screenshotTweet(
  args: TweetScreenshotArgs,
): Promise<TweetScreenshotResult> {
  const colorScheme = args.colorScheme ?? "dark";
  const lease = await leaseWindow();
  // CDP's `Emulation.setEmulatedMedia` has to be in place before the
  // navigation commits — X reads `prefers-color-scheme` once on mount
  // and never reacts to a mid-life flip, so flipping it after the page
  // has rendered would only repaint the platform chrome and leave the
  // article unchanged.
  let restoreEmulation: (() => Promise<void>) | null = null;
  try {
    restoreEmulation = await emulateColorScheme(lease.win, colorScheme);
    const navOk = await navigateWithTimeout(
      lease.win,
      args.url,
      NAV_TIMEOUT_MS,
    );
    if (!navOk) {
      log.warn("[pond screenshot:tweet] navigate failed", args.url);
      return { ok: false, reason: "navigate_failed" };
    }

    if (looksLikeAuthWall(lease.win.webContents.getURL())) {
      log.info("[pond screenshot:tweet] auth wall hit", args.url);
      return { ok: false, reason: "auth_required" };
    }

    // Belt-and-braces alongside the CDP emulated media: hide X's sticky
    // sign-up chrome and pin the html background to match the requested
    // scheme so any rounding in the article rect doesn't leak the host
    // window's default color through the screenshot's edges.
    const htmlBg = colorScheme === "light" ? "#fff" : "#000";
    await lease.win.webContents
      .insertCSS(
        `[data-testid="BottomBar"], [data-testid="bottomBar"], [data-testid="login"] { display: none !important; }
         html { color-scheme: ${colorScheme}; background: ${htmlBg} !important; }`,
      )
      .catch(() => {});

    const initial = await readArticleRect(lease.win, args.sourceId);
    if (!initial) {
      log.info("[pond screenshot:tweet] no article", args.url);
      return { ok: false, reason: "no_article" };
    }

    // Resize the hidden window tall enough to fit the entire article in
    // a single viewport before capturing. `capturePage` only captures
    // content that's been laid out within the live viewport; if the
    // article overflows, the bottom is silently cropped. After the
    // resize we re-measure because lazy media / sticky chrome can shift
    // the article's rect when more vertical space becomes available.
    const [contentWidth, originalContentHeight] = lease.win.getContentSize();
    const requiredHeight = Math.ceil(
      initial.y + initial.height + SCREENSHOT_VERTICAL_PADDING,
    );
    let rect = initial;
    let resized = false;
    if (requiredHeight > originalContentHeight) {
      const target = Math.min(requiredHeight, SCREENSHOT_MAX_HEIGHT);
      lease.win.setContentSize(contentWidth, target);
      resized = true;
      await sleep(400);
      const remeasured = await readArticleRect(lease.win, args.sourceId);
      if (remeasured) rect = remeasured;
    }

    try {
      return await withDeviceScaleFactor(
        lease.win,
        CAPTURE_DEVICE_SCALE_FACTOR,
        async () => {
          const image = await lease.win.webContents.capturePage({
            x: Math.max(0, Math.floor(rect.x)),
            y: Math.max(0, Math.floor(rect.y)),
            width: Math.max(1, Math.ceil(rect.width)),
            height: Math.max(1, Math.ceil(rect.height)),
          });
          const bytes = image.toPNG();
          const size = image.getSize();
          if (bytes.byteLength === 0 || size.width === 0 || size.height === 0) {
            log.warn("[pond screenshot:tweet] empty capture", args.url);
            return { ok: false, reason: "no_article" } as const;
          }
          return {
            ok: true,
            png: { bytes, width: size.width, height: size.height },
          } as const;
        },
      );
    } finally {
      if (resized) {
        try {
          lease.win.setContentSize(contentWidth, originalContentHeight);
        } catch {
          /* window may have been destroyed mid-capture; pool drops it */
        }
      }
    }
  } catch (err) {
    log.warn("[pond screenshot:tweet] unexpected error", args.url, err);
    return { ok: false, reason: "no_article" };
  } finally {
    if (restoreEmulation) await restoreEmulation().catch(() => {});
    lease.release();
  }
}

async function emulateColorScheme(
  win: BrowserWindow,
  scheme: "light" | "dark",
): Promise<() => Promise<void>> {
  const dbg = win.webContents.debugger;
  const alreadyAttached = dbg.isAttached();
  let attachedHere = false;
  try {
    if (!alreadyAttached) {
      dbg.attach("1.3");
      attachedHere = true;
    }
    await dbg.sendCommand("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: scheme }],
    });
  } catch (err) {
    log.warn(
      "[pond screenshot:tweet] emulated media setup failed",
      scheme,
      err,
    );
    if (attachedHere) {
      try {
        dbg.detach();
      } catch {
        /* attach failed mid-flight; nothing to detach */
      }
    }
    return async () => {};
  }
  return async () => {
    try {
      await dbg.sendCommand("Emulation.setEmulatedMedia", { features: [] });
    } catch {
      /* override may already be cleared; safe to ignore */
    }
    if (attachedHere) {
      try {
        dbg.detach();
      } catch {
        /* wc may have been destroyed mid-capture; pool drops it */
      }
    }
  };
}

// Override Chromium's device scale factor for the duration of `fn` via
// the DevTools Protocol. `capturePage` writes back a NativeImage sized at
// `cssRect × deviceScaleFactor`, so this is the lever for sharper PNGs
// without changing the page's CSS-pixel layout.
async function withDeviceScaleFactor<T>(
  win: BrowserWindow,
  factor: number,
  fn: () => Promise<T>,
): Promise<T> {
  const dbg = win.webContents.debugger;
  const alreadyAttached = dbg.isAttached();
  let attachedHere = false;
  try {
    if (!alreadyAttached) {
      dbg.attach("1.3");
      attachedHere = true;
    }
    const [width, height] = win.getContentSize();
    await dbg.sendCommand("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: factor,
      mobile: false,
    });
    return await fn();
  } finally {
    try {
      await dbg.sendCommand("Emulation.clearDeviceMetricsOverride");
    } catch {
      /* override may already be cleared; safe to ignore */
    }
    if (attachedHere) {
      try {
        dbg.detach();
      } catch {
        /* detach can throw if the wc was destroyed mid-capture */
      }
    }
  }
}

interface ArticleRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

async function readArticleRect(
  win: BrowserWindow,
  tweetId: string,
): Promise<ArticleRect | null> {
  const expr = buildArticleRectExpression(tweetId);
  const raw = await Promise.race([
    win.webContents.executeJavaScript(expr, true),
    sleep(SCREENSHOT_ARTICLE_TIMEOUT_MS).then(
      () => "__pond_screenshot_timeout__",
    ),
  ]);
  if (raw === "__pond_screenshot_timeout__") return null;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<ArticleRect>;
  if (
    typeof r.x !== "number" ||
    typeof r.y !== "number" ||
    typeof r.width !== "number" ||
    typeof r.height !== "number"
  ) {
    return null;
  }
  if (r.width < 8 || r.height < 8) return null;
  return r as ArticleRect;
}

function buildArticleRectExpression(tweetId: string): string {
  // Scroll to the very top of the document instead of centering the
  // article — centering produces a negative top when the article is
  // taller than the viewport, which the capture path used to clamp to
  // 0, pulling in X's "Post" header above the article and clipping the
  // bottom. With scrollTo(0, 0), `rect.y` is the article's natural
  // distance below X's chrome (positive), and the caller resizes the
  // window so `rect.y + rect.height` still fits inside the viewport.
  return `(async () => {
    try {
      const tweetId = ${JSON.stringify(tweetId)};
      const findArticle = () => {
        const anchor = document.querySelector('a[href*="/status/' + tweetId + '"]');
        return anchor && anchor.closest('article');
      };
      const articleDeadline = Date.now() + 10_000;
      let article = findArticle();
      while (!article && Date.now() < articleDeadline) {
        await new Promise(r => setTimeout(r, 200));
        article = findArticle();
      }
      if (!article) return null;

      window.scrollTo(0, 0);
      try { if (document.fonts && document.fonts.ready) await document.fonts.ready; } catch (_) {}
      await new Promise(r => requestAnimationFrame(() => r(null)));
      await new Promise(r => setTimeout(r, 150));

      const r = article.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    } catch (_) {
      return null;
    }
  })()`;
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

export type SignInMode = "external";

export async function signInToSource(
  source: Source,
): Promise<{ ok: boolean; mode: SignInMode }> {
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

  // `wc.loadURL` can hang indefinitely on stalled hosts (X under
  // rate-limit / soft-block stops emitting both did-finish-load and
  // did-fail-load, and the loadURL promise never settles). Previously
  // we awaited loadURL before racing the load events against the
  // timeout — a hang there leaked the pool window forever, eventually
  // pinning the reconciler at MAX_GLOBAL_INFLIGHT. Race the entire
  // navigation against a wall-clock budget and forcibly stop the
  // WebContents on miss so the pool slot can be reused.
  const navPromise = wc.loadURL(url).then(
    () => finished,
    () => false as const,
  );
  const TIMEOUT = Symbol("nav-timeout");
  const result = await Promise.race([
    navPromise,
    sleep(timeoutMs).then(() => TIMEOUT),
  ]);
  if (result === TIMEOUT) {
    try {
      wc.stop();
    } catch {
      /* wc may be destroyed mid-flight; pool drops it */
    }
    return false;
  }
  return result === true;
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

async function _writeStoredHandle(
  source: Source,
  handle: string,
): Promise<void> {
  const trimmed = handle.trim().replace(/^@/, "");
  if (!trimmed) return;
  try {
    const prefs = await getPrefs();
    const nextHandles = { ...(prefs.sync.handles ?? {}), [source]: trimmed };
    await setPrefs({ sync: { handles: nextHandles } });
  } catch (err) {
    log.warn("[pond refresh:signin] writeStoredHandle failed", source, err);
  }
}

// Opens the hidden window logged in via the partition cookies and reads
// the user's own handle from the rendered DOM. We pick the handle off
// the profile link in the top nav — it's the one stable, public-facing
// identifier every social site exposes once you're authenticated.
//
// Returns `null` if the session isn't authenticated or the DOM probe
// doesn't match (site redesign, sign-out, etc.). The caller should
// surface that as `auth_required`.
export async function probeUserHandle(source: Source): Promise<string | null> {
  const lease = await leaseWindow();
  try {
    const url = homeUrlForSource(source);
    const navOk = await navigateWithTimeout(lease.win, url, NAV_TIMEOUT_MS);
    if (!navOk) {
      log.warn("[pond refresh:probe] navigate failed", source, url);
      return null;
    }
    const current = lease.win.webContents.getURL();
    if (looksLikeAuthWall(current)) {
      log.info("[pond refresh:probe] auth wall hit", source, current);
      return null;
    }

    const expr = buildProbeExpression(source);
    const raw = await Promise.race([
      lease.win.webContents.executeJavaScript(expr, true),
      sleep(HARVEST_TIMEOUT_MS).then(() => "__pond_probe_timeout__"),
    ]);
    if (typeof raw !== "string" || raw === "__pond_probe_timeout__") {
      log.warn("[pond refresh:probe] no handle in DOM", source);
      return null;
    }
    const handle = raw.trim().replace(/^@/, "");
    return handle.length > 0 ? handle : null;
  } catch (err) {
    log.warn("[pond refresh:probe] unexpected error", source, err);
    return null;
  } finally {
    lease.release();
  }
}

function buildProbeExpression(source: Source): string {
  // Each site exposes a profile/avatar link in the top nav pointing at
  // `/<handle>`. We pick the first link whose href is a single-segment
  // path on the site's own host. The expressions return the trimmed
  // handle string or the empty string.
  switch (source) {
    case "cosmos":
      return `(() => {
        try {
          const host = location.hostname.replace(/^www\\./, '');
          const links = Array.from(document.querySelectorAll('a[href^="/"]'));
          for (const a of links) {
            const href = a.getAttribute('href') || '';
            const m = href.match(/^\\/([A-Za-z0-9_-]{2,40})(\\?.*)?$/);
            if (!m) continue;
            const handle = m[1];
            // Filter obvious non-user paths.
            if (['login','signup','signin','about','pricing','settings','explore','search','feed','home','clusters'].includes(handle.toLowerCase())) continue;
            // Prefer a link in the top nav / header.
            const inNav = a.closest('header, nav, [role="navigation"]');
            if (inNav) return handle;
          }
          // Fallback: any plausible match.
          for (const a of links) {
            const href = a.getAttribute('href') || '';
            const m = href.match(/^\\/([A-Za-z0-9_-]{2,40})(\\?.*)?$/);
            if (m && !['login','signup','signin','about','pricing','settings','explore','search','feed','home','clusters'].includes(m[1].toLowerCase())) return m[1];
          }
          void host;
          return '';
        } catch { return ''; }
      })()`;
    case "arena":
      return `(() => {
        try {
          // Are.na's user nav has a "Profile" link to /<slug>.
          const links = Array.from(document.querySelectorAll('a[href^="/"]'));
          for (const a of links) {
            const href = a.getAttribute('href') || '';
            const m = href.match(/^\\/([a-z0-9-]{2,60})(\\/?$|\\?.*$)/i);
            if (!m) continue;
            const slug = m[1];
            if (['about','blog','log-in','login','sign-up','signup','channels','search','explore','pricing','jobs','privacy','terms','team','press','help','support','settings'].includes(slug.toLowerCase())) continue;
            return slug;
          }
          return '';
        } catch { return ''; }
      })()`;
    default:
      return `''`;
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
    case "arena":
      // are.na (Rails) sets `_arena_session` when logged in; the
      // `remember_user_token` cookie marks long-lived auth.
      return (
        name === "_arena_session" ||
        name === "remember_user_token" ||
        name === "cf_clearance" // not auth on its own; tolerated so the
        // first sync probes — gets refined below if it's the only one.
      );
    case "cosmos":
      // cosmos.so uses Supabase/NextAuth-style session tokens. Their cookie
      // name has changed before, so accept the standard auth-token shapes
      // rather than pinning to one literal.
      return (
        /^sb-[a-z0-9-]+-auth-token(\.\d+)?$/.test(name) ||
        name === "__Secure-next-auth.session-token" ||
        name === "next-auth.session-token" ||
        name === "cosmos.session-token"
      );
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
  }
}

export async function disconnectSource(
  source: Source,
): Promise<{ ok: boolean }> {
  const persistent = session.fromPartition(PARTITION);
  const domain = primaryDomainForSource(source);
  if (!domain) return { ok: true };

  // Drop the cached handle too — derived from the session we're clearing.
  try {
    const prefs = await getPrefs();
    if (prefs.sync.handles?.[source]) {
      const nextHandles = { ...prefs.sync.handles };
      delete nextHandles[source];
      await setPrefs({ sync: { handles: nextHandles } });
    }
  } catch (err) {
    log.warn("[pond refresh:disconnect] handle clear failed", source, err);
  }

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
