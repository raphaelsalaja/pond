import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import log from "electron-log/main.js";
import { z } from "zod";
import type { CaptureColorScheme } from "./screenshot-scheme";

const THEME_COOKIE_NAME = "night_mode";
const THEME_COOKIE_HOSTS = ["x.com", "twitter.com"] as const;

type ThemeCookieJar = Pick<Electron.Cookies, "get" | "set" | "remove">;

const StoredCookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string().optional(),
  hostOnly: z.boolean().optional(),
  path: z.string().optional(),
  secure: z.boolean().optional(),
  httpOnly: z.boolean().optional(),
  sameSite: z.enum(["unspecified", "no_restriction", "lax", "strict"]),
  expirationDate: z.number().optional(),
});
type StoredCookie = z.infer<typeof StoredCookieSchema>;

const ThemeJournalSchema = z.object({
  partitions: z.record(z.string(), z.array(StoredCookieSchema)),
});
type ThemeJournal = z.infer<typeof ThemeJournalSchema>;

function themeHost(domain: string | undefined): string | null {
  const host = domain?.replace(/^\./, "") ?? "";
  return (
    THEME_COOKIE_HOSTS.find(
      (candidate) => host === candidate || host.endsWith(`.${candidate}`),
    ) ?? null
  );
}

function cookieUrl(cookie: StoredCookie): string | null {
  const host = cookie.domain?.replace(/^\./, "");
  if (!host) return null;
  const scheme = cookie.secure === false ? "http" : "https";
  return `${scheme}://${host}${cookie.path ?? "/"}`;
}

function storedCookie(cookie: Electron.Cookie): StoredCookie {
  const stored: StoredCookie = {
    name: cookie.name,
    value: cookie.value,
    sameSite: cookie.sameSite,
  };
  if (cookie.domain !== undefined) stored.domain = cookie.domain;
  if (cookie.hostOnly !== undefined) stored.hostOnly = cookie.hostOnly;
  if (cookie.path !== undefined) stored.path = cookie.path;
  if (cookie.secure !== undefined) stored.secure = cookie.secure;
  if (cookie.httpOnly !== undefined) stored.httpOnly = cookie.httpOnly;
  if (cookie.expirationDate !== undefined) {
    stored.expirationDate = cookie.expirationDate;
  }
  return stored;
}

async function removeThemeCookies(jar: ThemeCookieJar): Promise<void> {
  for (const host of THEME_COOKIE_HOSTS) {
    await jar.remove(`https://${host}/`, THEME_COOKIE_NAME).catch(() => {});
  }
}

async function putBackCookies(
  jar: ThemeCookieJar,
  cookies: Array<StoredCookie>,
): Promise<void> {
  await removeThemeCookies(jar);
  for (const cookie of cookies) {
    try {
      const url = cookieUrl(cookie);
      if (!url) continue;
      const details: Electron.CookiesSetDetails = {
        url,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path ?? "/",
        sameSite: cookie.sameSite,
      };
      if (cookie.secure !== undefined) details.secure = cookie.secure;
      if (cookie.httpOnly !== undefined) details.httpOnly = cookie.httpOnly;
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
}

/** Journal writes from overlapping captures on different Accounts go through one queue so none is lost. */
const journalQueues = new Map<string, Promise<void>>();

function updateJournal(
  path: string,
  change: (journal: ThemeJournal) => void,
): Promise<void> {
  const previous = journalQueues.get(path) ?? Promise.resolve();
  const next = previous.then(async () => {
    const journal = await readJournal(path);
    change(journal);
    if (Object.keys(journal.partitions).length === 0) {
      await rm(path, { force: true });
      return;
    }
    await mkdir(dirname(path), { recursive: true });
    const partial = `${path}.partial`;
    await writeFile(partial, JSON.stringify(journal));
    await rename(partial, path);
  });
  journalQueues.set(
    path,
    next.catch(() => {}),
  );
  return next;
}

async function readJournal(path: string): Promise<ThemeJournal> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return { partitions: {} };
  }
  try {
    return ThemeJournalSchema.parse(JSON.parse(text));
  } catch (error) {
    log.warn("[pond screenshot:tweet] unreadable theme journal", error);
    return { partitions: {} };
  }
}

export interface TwitterThemeCookieControl {
  setScheme(scheme: CaptureColorScheme): Promise<boolean>;
  restore(): Promise<void>;
}

/**
 * Forces X's theme for one capture. The override is a session cookie, so it never reaches disk,
 * and the Account's own cookie is recorded in the journal before it is touched, so
 * restoreInterruptedTwitterThemes can put it back if Pond quits mid-capture.
 */
export function createTwitterThemeCookieControl(args: {
  jar: ThemeCookieJar;
  partition: string;
  journalPath: string;
}): TwitterThemeCookieControl {
  const { jar, partition, journalPath } = args;
  let originals: Array<StoredCookie> | null = null;

  const setScheme = async (scheme: CaptureColorScheme): Promise<boolean> => {
    try {
      if (!originals) {
        const found = (await jar.get({ name: THEME_COOKIE_NAME }))
          .filter((cookie) => themeHost(cookie.domain) !== null)
          .map(storedCookie);
        await updateJournal(journalPath, (journal) => {
          journal.partitions[partition] = found;
        });
        originals = found;
        for (const cookie of found) {
          const url = cookieUrl(cookie);
          if (url) await jar.remove(url, cookie.name).catch(() => {});
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
    await putBackCookies(jar, stored);
    await updateJournal(journalPath, (journal) => {
      delete journal.partitions[partition];
    }).catch((cause: unknown) => {
      log.warn("[pond screenshot:tweet] theme journal clear failed", cause);
    });
  };

  return { setScheme, restore };
}

/** Puts back every Account theme cookie a capture overrode and never restored. Run at startup before any capture. */
export async function restoreInterruptedTwitterThemes(args: {
  journalPath: string;
  jarFor: (partition: string) => ThemeCookieJar;
}): Promise<void> {
  const journal = await readJournal(args.journalPath);
  const partitions = Object.keys(journal.partitions);
  if (partitions.length === 0) return;
  for (const partition of partitions) {
    const cookies = journal.partitions[partition] ?? [];
    log.info("[pond screenshot:tweet] restoring interrupted theme", partition);
    await putBackCookies(args.jarFor(partition), cookies);
  }
  await updateJournal(args.journalPath, (current) => {
    for (const partition of partitions) delete current.partitions[partition];
  });
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

/**
 * The theme cookie lives in the Account's shared cookie jar, so two captures on one Account
 * would flip each other's theme mid-capture. Captures on different Accounts still run in parallel.
 */
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
