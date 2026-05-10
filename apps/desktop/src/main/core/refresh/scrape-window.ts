import { join } from "node:path";
import type { Source } from "@pond/schema/db";
import { BrowserWindow, type Cookie, session } from "electron";
import log from "electron-log/main.js";
import { harvesterFor } from "./harvest";
import {
  arenaProfileUrl,
  buildArenaListExpression,
} from "./harvest/arena-list";
import {
  buildCosmosListExpression,
  COSMOS_LIST_URL,
} from "./harvest/cosmos-list";
import {
  buildInstagramListExpression,
  instagramSavedUrl,
} from "./harvest/instagram-list";
import type { ListHarvestArgs, ListHarvestResult } from "./harvest/list-types";
import {
  buildPinterestListExpression,
  pinterestProfileUrl,
} from "./harvest/pinterest-list";
import {
  buildRedditListExpression,
  redditSavedUrl,
} from "./harvest/reddit-list";
import {
  buildTiktokListExpression,
  tiktokFavouritesUrl,
} from "./harvest/tiktok-list";
import {
  type BookmarksEntry,
  type BookmarksHarvestArgs,
  type BookmarksHarvestResult,
  buildBookmarksExpression,
} from "./harvest/twitter-bookmarks";
import { parseBookmarksResponses } from "./harvest/twitter-bookmarks-graphql";
import type { ScrapedHarvest } from "./harvest/types";
import {
  buildYoutubeListExpression,
  YOUTUBE_LIST_URLS,
} from "./harvest/youtube-list";
import { homeUrlForSource } from "./sources";

/**
 * Hidden Electron `BrowserWindow` driven entirely from main. Replays
 * what the browser extension would do when the user lands on a save's
 * page: navigate, wait for hydration, run the in-page harvester,
 * collect the result.
 *
 * Cookies persist across runs via the `persist:pond-scrapers` partition,
 * so once the user signs into a source via `signInToSource()` we can
 * scrape pages on that domain forever without bouncing them through
 * their default browser again.
 */

const PARTITION = "persist:pond-scrapers";
const NAV_TIMEOUT_MS = 25_000;
const HARVEST_TIMEOUT_MS = 20_000;

let hiddenWindow: BrowserWindow | null = null;

/**
 * One window, lazy-created, reused across captures. Reusing instead of
 * tearing down per-capture is significantly faster for back-to-back
 * refreshes (no Chromium spin-up cost). We do *not* `nodeIntegration`
 * or expose a preload — the hidden window is treated like a sandboxed
 * web page, so a malicious site can't reach the desktop process.
 */
function ensureHidden(): BrowserWindow {
  if (hiddenWindow && !hiddenWindow.isDestroyed()) return hiddenWindow;
  const persistent = session.fromPartition(PARTITION);
  // Spoof a realistic Chrome UA so sites that lock out unknown UAs
  // (Twitter dropped support for non-Chrome a while back) still serve
  // the full SPA bundle.
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
      // The scrape preload installs an XHR-prototype hook in the page
      // main world via `webFrame.executeJavaScript`. The hook captures
      // Twitter Bookmarks GraphQL responses for the harvester to drain.
      // Loaded for every page we navigate to; the hook self-skips if
      // the URL doesn't match.
      preload: join(__dirname, "../preload/scrape.cjs"),
      // Block plugins / pop-ups from random sites we navigate to.
      plugins: false,
      webgl: false,
      autoplayPolicy: "document-user-activation-required",
    },
  });
  // Block new windows entirely — anything that wants to open a popup
  // can have it suppressed silently.
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.on("closed", () => {
    if (hiddenWindow === win) hiddenWindow = null;
  });
  hiddenWindow = win;
  return win;
}

export interface HarvestArgs {
  url: string;
  source: Source | null;
  /** When the dispatcher already has a sourceId (from the existing save row), reuse it. */
  sourceId?: string;
}

export interface HarvestResult {
  ok: boolean;
  harvest?: ScrapedHarvest;
  /** Resolved sourceId — falls back to whatever the harvester derives from the URL. */
  sourceId?: string;
  reason?: "navigate_failed" | "harvest_failed" | "auth_required" | "timeout";
}

/**
 * Drive the hidden window to a URL and run the source-appropriate
 * harvester. Detects "you got redirected to a login wall" by comparing
 * the final URL's path against an obvious sign-in slug list — if it
 * matches we tell the caller `auth_required` so it can prompt the
 * user to connect that source.
 */
export async function harvestUrl(args: HarvestArgs): Promise<HarvestResult> {
  const win = ensureHidden();
  const harv = harvesterFor(args.source);
  const sourceId = args.sourceId ?? harv.sourceIdFromUrl(args.url) ?? "";

  try {
    const navOk = await navigateWithTimeout(win, args.url, NAV_TIMEOUT_MS);
    if (!navOk) {
      log.warn("[pond refresh:window] navigate failed", args.url);
      return { ok: false, reason: "navigate_failed", sourceId };
    }

    if (looksLikeAuthWall(win.webContents.getURL())) {
      log.info(
        "[pond refresh:window] auth wall detected",
        win.webContents.getURL(),
      );
      return { ok: false, reason: "auth_required", sourceId };
    }

    const expr = harv.buildExpression(sourceId);
    const raw = await Promise.race([
      win.webContents.executeJavaScript(expr, true),
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
  }
}

/**
 * Generic per-source list harvester. Each Phase-3 source ships its own
 * `harvest/<source>-list.ts` with a `build<Source>ListExpression(args)`
 * builder; we navigate the hidden window to a source-specific list URL,
 * eval the expression, and return the typed `ListHarvestResult`.
 *
 * Sources that need account-specific URLs (Are.na/Pinterest/Instagram/
 * Reddit/TikTok all key off the user's handle/slug) accept an
 * `accountKey` argument the orchestrator resolves before calling.
 */
export interface SourceListArgs extends ListHarvestArgs {
  /** Per-source profile slug. Required for sources whose list URL needs it. */
  accountKey?: string;
}

export async function harvestSourceList(
  source: Source,
  args: SourceListArgs,
): Promise<ListHarvestResult> {
  const win = ensureHidden();
  const target = listUrlForSource(source, args.accountKey);
  if (!target) {
    return { ok: false, reason: "no_match" };
  }
  try {
    const navOk = await navigateWithTimeout(win, target, NAV_TIMEOUT_MS);
    if (!navOk) {
      return { ok: false, reason: "timeout" };
    }
    if (looksLikeAuthWall(win.webContents.getURL())) {
      return { ok: false, reason: "auth_required" };
    }
    const expr = buildListExpressionFor(source, args);
    if (!expr) {
      return { ok: false, reason: "no_match" };
    }
    const raw = await Promise.race([
      win.webContents.executeJavaScript(expr, true),
      sleep(90_000).then(() => "__pond_list_timeout__"),
    ]);
    if (raw === "__pond_list_timeout__") {
      log.warn("[pond list]", source, "harvest timed out");
      return { ok: false, reason: "timeout" };
    }
    if (!raw || typeof raw !== "object") {
      return { ok: false, reason: "no_match" };
    }
    return raw as ListHarvestResult;
  } catch (err) {
    log.warn("[pond list]", source, "unexpected error", err);
    return { ok: false, reason: "timeout" };
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
      return COSMOS_LIST_URL;
    case "arena":
      return accountKey ? arenaProfileUrl(accountKey) : null;
    case "pinterest":
      return accountKey ? pinterestProfileUrl(accountKey) : null;
    case "instagram":
      return accountKey ? instagramSavedUrl(accountKey) : null;
    case "reddit":
      return accountKey ? redditSavedUrl(accountKey) : null;
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
    case "reddit":
      return buildRedditListExpression(args);
    case "tiktok":
      return buildTiktokListExpression(args);
    case "twitter":
    case "article":
      return null;
  }
}

/**
 * YouTube exposes Watch Later (`WL`) and Liked (`LL`) on separate
 * URLs. This helper lets the orchestrator opt into a follow-up pass
 * once the first list returns.
 */
export async function harvestYoutubeLikedList(
  args: ListHarvestArgs,
): Promise<ListHarvestResult> {
  const win = ensureHidden();
  try {
    const navOk = await navigateWithTimeout(
      win,
      YOUTUBE_LIST_URLS[1],
      NAV_TIMEOUT_MS,
    );
    if (!navOk) return { ok: false, reason: "timeout" };
    if (looksLikeAuthWall(win.webContents.getURL())) {
      return { ok: false, reason: "auth_required" };
    }
    const expr = buildYoutubeListExpression(args);
    const raw = await Promise.race([
      win.webContents.executeJavaScript(expr, true),
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
  }
}

/**
 * Drive the hidden window to the user's Twitter bookmarks list and run
 * the bookmarks harvester. Reuses the same persistent partition as
 * `harvestUrl` so it picks up the user's cookies; `BookmarksHarvestArgs`
 * controls dedup + cap behaviour. Detects auth wall the same way
 * (Twitter redirects to `/i/flow/login`).
 *
 * Twitter keeps a bespoke entry point because it predates the generic
 * `harvestSourceList()` driver and produces a `BookmarksHarvestResult`
 * shape with `tweetId` rather than `sourceId`. The orchestrator
 * funnels both through the same dedupe + per-item enrichment loop.
 */
/**
 * Live progress emitted from the in-page walker. The main-process
 * poller polls `globalThis.__pondHarvestStats` at ~1.5s cadence and
 * forwards each tick to the orchestrator via `onProgress`.
 */
export interface BookmarksHarvestProgress {
  /** "hydrate" while waiting for the bookmarks list to paint, "scroll" once it's walking. */
  phase: "hydrate" | "scroll";
  /** Distinct tweet ids walked so far. */
  seen: number;
  /** Subset of `seen` that isn't already in the local DB. */
  fresh: number;
  /** Articles currently in the DOM (virtualised so this drifts). */
  articles: number;
  /** GraphQL Bookmarks responses captured so far. */
  captures: number;
  /** Scroll iterations executed by the in-page loop. */
  scrolls: number;
}

export async function harvestTwitterBookmarks(
  args: BookmarksHarvestArgs,
  opts: { onProgress?: (p: BookmarksHarvestProgress) => void } = {},
): Promise<BookmarksHarvestResult> {
  const win = ensureHidden();
  try {
    const navOk = await navigateWithTimeout(
      win,
      "https://x.com/i/bookmarks",
      NAV_TIMEOUT_MS,
    );
    if (!navOk) return { ok: false, reason: "timeout" };
    if (looksLikeAuthWall(win.webContents.getURL())) {
      return { ok: false, reason: "auth_required" };
    }
    const expr = buildBookmarksExpression(args);

    // Live progress poller. The in-page walker writes its current
    // state into `globalThis.__pondHarvestStats` on every hydrate
    // tick / scroll iteration. We `executeJavaScript` a tiny read
    // every 1.5s alongside the heavy harvest call — Chromium happily
    // interleaves these on the same webContents because the harvest
    // is `await`ing setTimeout between scrolls. Each poll that shows
    // movement gets forwarded to `onProgress` so the orchestrator
    // can update the toast in real time. Without this the user sees
    // "Looking at your Twitter bookmarks…" frozen for the entire
    // run; large libraries can take minutes.
    let lastSeen = -1;
    let lastPhase: BookmarksHarvestProgress["phase"] | null = null;
    let stopPolling = false;
    const pollInterval = setInterval(() => {
      if (stopPolling) return;
      void win.webContents
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

    // The in-page scroll loop runs for up to ~5 minutes
    // (`SCROLL_DEADLINE_MS` in `twitter-bookmarks.ts`), so the outer
    // timeout is sized to comfortably cover that plus hydration slack.
    const raw = await Promise.race([
      win.webContents.executeJavaScript(expr, true),
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

    // Parse every Bookmarks GraphQL response the preload's XHR hook
    // captured during the scroll, then merge the rich payload into
    // the DOM-discovered entries. The DOM walker is the discovery
    // floor — every visible card has an entry — and the GraphQL data
    // is enrichment laid on top. If the hook captured nothing (CSP
    // edge case, hook installed too late on the very first request,
    // Twitter changed shape) we still ingest every visible bookmark
    // with slim card data.
    const rich = parseBookmarksResponses(result.captures);
    const merged: BookmarksEntry[] = result.entries.map((entry) => {
      const r = rich.get(entry.tweetId);
      if (!r) return entry;
      const firstLine = r.fullText.split(/\n+/)[0]?.trim() ?? "";
      const richTitle =
        firstLine.length === 0
          ? entry.title
          : firstLine.length <= 90
            ? firstLine
            : `${firstLine.slice(0, 89).trimEnd()}…`;
      return {
        ...entry,
        title: richTitle ?? entry.title,
        description: r.fullText || entry.description,
        author: r.author.handle ? `@${r.author.handle}` : entry.author,
        mediaUrls: r.media.length > 0 ? r.media : entry.mediaUrls,
        mediaUrl: r.media[0]?.url ?? entry.mediaUrl,
        rich: r,
      };
    });
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
  }
}

/**
 * Pop a *visible* window pointed at the source's login URL. The user
 * signs in there; cookies land in the same `persist:pond-scrapers`
 * partition the hidden window uses, so subsequent refreshes are
 * authenticated.
 *
 * We hand the user a regular Chromium window (no chrome of our own) so
 * Sign-in-with-Google, hCaptcha, etc. all just work. Returns when the
 * user closes the window.
 */
export async function signInToSource(source: Source): Promise<{ ok: boolean }> {
  const persistent = session.fromPartition(PARTITION);
  persistent.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  );

  const win = new BrowserWindow({
    width: 480,
    height: 720,
    title: `Sign in to ${source}`,
    autoHideMenuBar: true,
    webPreferences: {
      session: persistent,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Same preload as the hidden scrape window — the user might
      // scroll their bookmarks list inside the sign-in popup before
      // closing it, in which case we'll happily capture whatever
      // GraphQL fires.
      preload: join(__dirname, "../preload/scrape.cjs"),
    },
  });
  // Keep popups inside this same window — don't spawn new top-level
  // windows for OAuth handoffs.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void win.loadURL(url);
    return { action: "deny" };
  });
  try {
    await win.loadURL(homeUrlForSource(source));
  } catch (err) {
    log.warn("[pond refresh:signin] initial load failed", source, err);
  }

  await new Promise<void>((resolve) => {
    win.once("closed", () => resolve());
  });

  // Kick an immediate sync the moment the user finishes sign-in.
  // Without this the cron picks them up within ~60s anyway, but the
  // perceived latency on a fresh connect (esp. Twitter) is jarring.
  // Lazy-imported to avoid the `sync` ↔ `scrape-window` module cycle;
  // fire-and-forget so the connect IPC isn't blocked.
  if (await isSourceConnected(source)) {
    void import("../sync")
      .then(({ syncSource }) => syncSource(source, { trigger: "manual" }))
      .catch((err) =>
        log.warn("[pond refresh:signin] post-signin sync threw", err),
      );
  }

  return { ok: true };
}

/**
 * Heuristic check: are we currently being held at a login screen?
 * Reasonable across the auth-walled sites we care about. Used both as
 * an early-exit when the hidden window gets redirected to login, and
 * as a way to tell the caller "ask the user to connect this source".
 */
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

/**
 * `loadURL` resolves on `did-finish-load`, but Twitter's SPA can throw
 * an in-flight error before then if the URL is malformed. Wrap with our
 * own timeout so a hung page doesn't pin the harvester forever.
 */
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

/**
 * Lightweight introspection: do we already have cookies for this
 * source? Lets the renderer paint a "Connected ✓" badge per source on
 * the settings page without needing the user to ever see a window.
 */
export async function isSourceConnected(source: Source): Promise<boolean> {
  const cookies = await listCookiesForSource(source);
  return cookies.length > 0;
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

function primaryDomainForSource(source: Source): string | null {
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
    case "reddit":
      return ".reddit.com";
    case "article":
      return null;
  }
}

/**
 * Wipe all cookies / storage for a given source. Used by the "Disconnect"
 * button on settings.
 */
export async function disconnectSource(
  source: Source,
): Promise<{ ok: boolean }> {
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

/**
 * Dispose the hidden window. Called on app quit so we don't leak the
 * Chromium child process; safe to call from anywhere.
 */
export function disposeHiddenWindow(): void {
  if (hiddenWindow && !hiddenWindow.isDestroyed()) {
    hiddenWindow.destroy();
  }
  hiddenWindow = null;
}
