import { setTimeout as sleep } from "node:timers/promises";
import type { BrowserWindow } from "electron";
import log from "electron-log/main.js";

export function looksLikeAuthWall(currentUrl: string): boolean {
  try {
    const u = new URL(currentUrl);
    const p = u.pathname.toLowerCase();
    if (
      p.startsWith("/login") ||
      p.startsWith("/log-in") ||
      p.startsWith("/log_in") ||
      p.startsWith("/signin") ||
      p.startsWith("/sign-in") ||
      p.startsWith("/sign_in") ||
      p.startsWith("/signup") ||
      p.startsWith("/sign-up") ||
      p.startsWith("/session/new") ||
      p.startsWith("/register") ||
      p.startsWith("/i/flow/login") ||
      p.startsWith("/accounts/login") ||
      p.startsWith("/uas/login") ||
      p.startsWith("/auth")
    ) {
      return true;
    }
    if (u.hostname.includes("accounts.google.com")) return true;
    if (u.hostname.includes("login.reddit.com")) return true;
    return false;
  } catch {
    return false;
  }
}

export function looksLikeChallenge(currentUrl: string): null | {
  kind: "challenge" | "checkpoint" | "captcha";
} {
  try {
    const u = new URL(currentUrl);
    const p = u.pathname.toLowerCase();
    const hay = `${p}?${u.search.toLowerCase()}`;
    if (p.includes("/challenge") || hay.includes("challenge")) {
      return { kind: "challenge" };
    }
    if (p.includes("/checkpoint")) return { kind: "checkpoint" };
    if (
      p.includes("/account/access") ||
      p.includes("/i/flow/consent") ||
      p.includes("/captcha") ||
      u.hostname.includes("funcaptcha") ||
      u.hostname.includes("arkoselabs")
    ) {
      return { kind: "captcha" };
    }
    return null;
  } catch {
    return null;
  }
}

export async function navigateWithTimeout(
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
    const onFail = (
      _e: Electron.Event,
      code: number,
      desc: string,
      failedUrl: string,
      isMainFrame: boolean,
    ) => {
      if (!isMainFrame || code === -3) return;
      log.info("[pond scrape] nav load failed", { code, desc, failedUrl });
      cleanup();
      resolve(false);
    };
    const cleanup = () => {
      wc.off("did-finish-load", onDone);
      wc.off("did-fail-load", onFail);
    };
    wc.once("did-finish-load", onDone);
    wc.on("did-fail-load", onFail);
  });

  /** loadURL can hang on stalled hosts; race the whole nav against a timeout and stop on miss. */
  const navPromise = (async () => {
    try {
      await wc.loadURL(url);
    } catch (err) {
      if (err instanceof Error && err.message.includes("ERR_ABORTED")) {
        return finished;
      }
      log.info("[pond scrape] loadURL rejected", {
        url,
        err: err instanceof Error ? err.message : String(err),
      });
      return false as const;
    }
    return finished;
  })();
  const TIMEOUT = Symbol("nav-timeout");
  const result = await Promise.race([
    navPromise,
    sleep(timeoutMs).then(() => TIMEOUT),
  ]);
  if (result === TIMEOUT) {
    try {
      wc.stop();
    } catch {}
    return false;
  }
  return result === true;
}

/** Anubis serves its proof-of-work page here, then redirects back once the browser solves it. */
export function isInterstitial(currentUrl: string): boolean {
  try {
    return new URL(currentUrl).pathname.startsWith("/.within.website");
  } catch {
    return false;
  }
}

export async function waitPastInterstitial(
  win: BrowserWindow,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!win.isDestroyed() && isInterstitial(win.webContents.getURL())) {
    if (Date.now() > deadline) return false;
    await sleep(250);
  }
  return !win.isDestroyed();
}
