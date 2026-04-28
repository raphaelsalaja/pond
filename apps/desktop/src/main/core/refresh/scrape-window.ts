import type { Source } from "@pond/schema/db";
import { BrowserWindow, type Cookie, session } from "electron";
import log from "electron-log/main.js";
import { harvesterFor } from "./harvest";
import type { ScrapedHarvest } from "./harvest/types";
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
