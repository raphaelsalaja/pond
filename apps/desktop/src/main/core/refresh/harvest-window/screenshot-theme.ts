import log from "electron-log/main.js";
import type { CaptureColorScheme } from "./screenshot-scheme";

const THEME_COOKIE_NAME = "night_mode";
const THEME_COOKIE_HOSTS = ["x.com", "twitter.com"] as const;

export interface ThemeCookieJar {
  get(filter: Electron.CookiesGetFilter): Promise<Array<Electron.Cookie>>;
  set(details: Electron.CookiesSetDetails): Promise<void>;
  remove(url: string, name: string): Promise<void>;
}

function themeHost(domain: string | undefined): string | null {
  const host = domain?.replace(/^\./, "") ?? "";
  return (
    THEME_COOKIE_HOSTS.find(
      (candidate) => host === candidate || host.endsWith(`.${candidate}`),
    ) ?? null
  );
}

function cookieUrl(cookie: Electron.Cookie): string | null {
  const host = cookie.domain?.replace(/^\./, "");
  if (!host) return null;
  const scheme = cookie.secure === false ? "http" : "https";
  return `${scheme}://${host}${cookie.path ?? "/"}`;
}

async function removeCookie(
  jar: ThemeCookieJar,
  cookie: Electron.Cookie,
): Promise<void> {
  const url = cookieUrl(cookie);
  if (!url) return;
  await jar.remove(url, cookie.name);
}

async function removeThemeCookies(jar: ThemeCookieJar): Promise<void> {
  for (const host of THEME_COOKIE_HOSTS) {
    await jar.remove(`https://${host}/`, THEME_COOKIE_NAME).catch(() => {});
  }
}

export interface TwitterThemeCookieControl {
  setScheme(scheme: CaptureColorScheme): Promise<boolean>;
  restore(): Promise<void>;
}

export function createTwitterThemeCookieControl(
  jar: ThemeCookieJar,
): TwitterThemeCookieControl {
  let originals: Array<Electron.Cookie> | null = null;

  const setScheme = async (scheme: CaptureColorScheme): Promise<boolean> => {
    try {
      if (!originals) {
        originals = (await jar.get({ name: THEME_COOKIE_NAME })).filter(
          (cookie) => themeHost(cookie.domain) !== null,
        );
        for (const cookie of originals) {
          await removeCookie(jar, cookie).catch(() => {});
        }
      }
      await removeThemeCookies(jar);

      /** X reads night_mode 0 as light and 2 as its black dark theme. */
      const value = scheme === "dark" ? "2" : "0";
      for (const host of THEME_COOKIE_HOSTS) {
        await jar.set({
          url: `https://${host}/`,
          name: THEME_COOKIE_NAME,
          value,
          domain: `.${host}`,
          path: "/",
          secure: true,
          sameSite: "no_restriction",
        });
      }
      return true;
    } catch (error) {
      log.warn("[pond screenshot:tweet] theme cookie override failed", error);
      return false;
    }
  };

  const restore = async (): Promise<void> => {
    if (!originals) return;
    const stored = originals;
    originals = null;
    await removeThemeCookies(jar);
    for (const cookie of stored) {
      try {
        const url = cookieUrl(cookie);
        if (!url) continue;
        const details: Electron.CookiesSetDetails = {
          url,
          name: cookie.name,
          value: cookie.value,
          path: cookie.path ?? "/",
          secure: cookie.secure,
          httpOnly: cookie.httpOnly,
          sameSite: cookie.sameSite,
        };
        if (cookie.expirationDate !== undefined) {
          details.expirationDate = cookie.expirationDate;
        }
        if (cookie.hostOnly !== true && cookie.domain) {
          details.domain = cookie.domain;
        }
        await jar.set(details);
      } catch (error) {
        log.warn("[pond screenshot:tweet] theme cookie restore failed", error);
      }
    }
  };

  return { setScheme, restore };
}

interface LockWaiter {
  signal?: AbortSignal;
  settled: boolean;
  resolve: (release: () => void) => void;
  onAbort: () => void;
}

const lockQueues = new Map<string, Array<LockWaiter>>();
const activeLocks = new Set<string>();

function drainThemeLock(partition: string): void {
  if (activeLocks.has(partition)) return;
  const queue = lockQueues.get(partition);
  if (!queue) return;
  while (queue.length > 0 && queue[0]?.settled) queue.shift();
  const next = queue.shift();
  if (!next) {
    lockQueues.delete(partition);
    return;
  }
  activeLocks.add(partition);
  next.settled = true;
  if (next.signal) next.signal.removeEventListener("abort", next.onAbort);
  let released = false;
  next.resolve(() => {
    if (released) return;
    released = true;
    activeLocks.delete(partition);
    drainThemeLock(partition);
  });
}

export async function acquireTwitterThemeLock(
  partition: string,
  signal?: AbortSignal,
): Promise<() => void> {
  if (signal?.aborted) throw new Error("twitter theme lock wait aborted");
  return new Promise((resolve, reject) => {
    const waiter: LockWaiter = {
      settled: false,
      resolve,
      onAbort: () => {
        if (waiter.settled) return;
        waiter.settled = true;
        const queue = lockQueues.get(partition);
        const index = queue?.indexOf(waiter) ?? -1;
        if (queue && index !== -1) queue.splice(index, 1);
        reject(new Error("twitter theme lock wait aborted"));
      },
    };
    if (signal) waiter.signal = signal;
    if (signal)
      signal.addEventListener("abort", waiter.onAbort, { once: true });
    const queue = lockQueues.get(partition) ?? [];
    queue.push(waiter);
    lockQueues.set(partition, queue);
    drainThemeLock(partition);
  });
}
