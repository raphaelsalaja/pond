import { setTimeout as sleep } from "node:timers/promises";
import type { ConnectedAccount } from "@pond/schema/db";
import { BrowserWindow, session, shell } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import { partitionForAccount } from "../../../sync/accounts";
import {
  browserUserAgent,
  NAV_TIMEOUT_MS,
} from "../../harvest-window/constants";
import { navigateWithTimeout } from "../../harvest-window/navigation";
import { leaseWindow } from "../../harvest-window/pool";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import { readBlueskyBookmarks } from "./bookmarks";
import type { BookmarkPage } from "./bookmarks";

const WEB = "https://bsky.app";
const SETTLE_MS = 20_000;
const SIGN_IN_TIMEOUT_MS = 10 * 60_000;
/** A token this close to expiry could lapse mid-walk, so the page gets time to refresh it first. */
const MIN_TOKEN_LIFE_S = 60;

/**
 * Reads the account the bsky.app client signed in, without its tokens.
 * @remarks Pond never refreshes the session itself; a refresh rotates the refresh token and signs the page out.
 */
const SESSION_EXPRESSION = `(() => {
  try {
    const raw = localStorage.getItem("BSKY_STORAGE");
    if (!raw) return null;
    const s = JSON.parse(raw).session;
    const did = s && s.currentAccount && s.currentAccount.did;
    const a = did && (s.accounts || []).find((x) => x.did === did);
    if (!a || !a.accessJwt || !a.refreshJwt) return null;
    let exp = 0;
    try {
      const part = a.accessJwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      exp = JSON.parse(atob(part)).exp || 0;
    } catch {}
    return { did: a.did, handle: a.handle || null, exp };
  } catch {
    return null;
  }
})()`;

const SessionSchema = z
  .object({
    did: z.string(),
    handle: z.string().nullable().catch(null),
    exp: z.number().catch(0),
  })
  .nullable()
  .catch(null);

type BlueskySession = NonNullable<z.infer<typeof SessionSchema>>;

const PageResultSchema = z
  .object({
    status: z.number(),
    body: z.json().nullable().catch(null),
  })
  .nullable()
  .catch(null);

/** The request the bsky.app client makes for its Saved tab, sent from the page so the token never leaves it. */
function bookmarkPageExpression(cursor: string | undefined): string {
  return `(async () => {
    const s = JSON.parse(localStorage.getItem("BSKY_STORAGE") || "{}").session || {};
    const did = s.currentAccount && s.currentAccount.did;
    const a = (s.accounts || []).find((x) => x.did === did);
    if (!a || !a.accessJwt) return { status: 401, body: null };
    const host = String(a.pdsUrl || a.service || "https://bsky.social").replace(/\\/+$/, "");
    const q = new URLSearchParams({ limit: "100" });
    const cursor = ${JSON.stringify(cursor ?? null)};
    if (cursor) q.set("cursor", cursor);
    const res = await fetch(host + "/xrpc/app.bsky.bookmark.getBookmarks?" + q, {
      headers: {
        authorization: "Bearer " + a.accessJwt,
        "atproto-proxy": "did:web:api.bsky.app#bsky_appview",
      },
    });
    let body = null;
    try { body = await res.json(); } catch {}
    return { status: res.status, body };
  })()`;
}

async function readSession(win: BrowserWindow): Promise<BlueskySession | null> {
  if (win.isDestroyed()) {
    return null;
  }
  try {
    return SessionSchema.parse(
      await win.webContents.executeJavaScript(SESSION_EXPRESSION, true),
    );
  } catch {
    return null;
  }
}

/** The client renews an expired token on load, so this waits for that instead of refreshing. */
async function waitForSession(
  win: BrowserWindow,
  did: string,
): Promise<BlueskySession | null> {
  const deadline = Date.now() + SETTLE_MS;
  while (Date.now() < deadline) {
    const current = await readSession(win);
    if (
      current?.did === did &&
      current.exp > Date.now() / 1000 + MIN_TOKEN_LIFE_S
    ) {
      return current;
    }
    await sleep(500);
  }
  return null;
}

function pageIn(win: BrowserWindow, did: string): BookmarkPage {
  return async (cursor) => {
    const run = async () =>
      PageResultSchema.parse(
        await win.webContents.executeJavaScript(
          bookmarkPageExpression(cursor),
          true,
        ),
      );
    try {
      const first = await run();
      if (first?.status !== 400 && first?.status !== 401) {
        return first;
      }
      /** An expired token answers 400 ExpiredToken; a reload lets the client renew it. */
      win.webContents.reload();
      if (!(await waitForSession(win, did))) {
        return first;
      }
      return await run();
    } catch (error) {
      log.warn("[pond bluesky] bookmark page failed", error);
      return null;
    }
  };
}

export async function harvestBlueskyBookmarks(
  args: ListHarvestArgs,
  did: string,
  partition: string | undefined,
): Promise<ListHarvestResult> {
  if (!partition) {
    return { ok: false, reason: "auth_required" };
  }
  const lease = await leaseWindow("bluesky", { partition });
  try {
    if (!(await navigateWithTimeout(lease.win, `${WEB}/`, NAV_TIMEOUT_MS))) {
      return { ok: false, reason: "timeout" };
    }
    if (!(await waitForSession(lease.win, did))) {
      return { ok: false, reason: "auth_required" };
    }
    return await readBlueskyBookmarks(args, pageIn(lease.win, did));
  } finally {
    lease.release();
  }
}

export type BlueskySessionStatus =
  | { signedIn: true; handle: string | null }
  | { signedIn: false; otherHandle: string | null };

function statusFor(
  account: ConnectedAccount,
  current: BlueskySession | null,
): BlueskySessionStatus {
  if (current && current.did === account.identityKey) {
    return { signedIn: true, handle: current.handle };
  }
  return { signedIn: false, otherHandle: current?.handle ?? null };
}

export async function blueskySessionStatus(
  account: ConnectedAccount,
): Promise<BlueskySessionStatus> {
  const lease = await leaseWindow("bluesky", {
    partition: partitionForAccount(account.id),
  });
  try {
    if (!(await navigateWithTimeout(lease.win, `${WEB}/`, NAV_TIMEOUT_MS))) {
      return { signedIn: false, otherHandle: null };
    }
    const deadline = Date.now() + 5000;
    let current = await readSession(lease.win);
    while (!current && Date.now() < deadline) {
      await sleep(500);
      current = await readSession(lease.win);
    }
    return statusFor(account, current);
  } finally {
    lease.release();
  }
}

export type BlueskySignInResult =
  | { ok: true; handle: string | null }
  | {
      ok: false;
      reason: "cancelled" | "other_account";
      otherHandle: string | null;
    };

interface SignInWindow {
  win: BrowserWindow;
  result: Promise<BlueskySignInResult>;
}

const signInWindows = new Map<string, SignInWindow>();

/** Opens bsky.app on the Account's own cookie jar and resolves once you sign in as that Account. */
export function signInToBluesky(
  account: ConnectedAccount,
): Promise<BlueskySignInResult> {
  const open = signInWindows.get(account.id);
  if (open && !open.win.isDestroyed()) {
    open.win.focus();
    return open.result;
  }
  const win = createSignInWindow(account);
  const result = watchSignIn(account, win).finally(() =>
    signInWindows.delete(account.id),
  );
  signInWindows.set(account.id, { win, result });
  return result;
}

function createSignInWindow(account: ConnectedAccount): BrowserWindow {
  const ses = session.fromPartition(partitionForAccount(account.id));
  ses.setUserAgent(browserUserAgent());
  const win = new BrowserWindow({
    width: 520,
    height: 760,
    title: `Sign In to Bluesky as @${account.handle ?? "you"}`,
    webPreferences: {
      session: ses,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.on("page-title-updated", (event) => event.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  void win.loadURL(`${WEB}/`).catch((cause: unknown) => {
    log.warn("[pond bluesky] sign-in page failed to load", cause);
  });
  return win;
}

async function watchSignIn(
  account: ConnectedAccount,
  win: BrowserWindow,
): Promise<BlueskySignInResult> {
  let closed = false;
  win.on("closed", () => {
    closed = true;
  });
  const deadline = Date.now() + SIGN_IN_TIMEOUT_MS;
  let otherHandle: string | null = null;
  while (!closed && Date.now() < deadline) {
    await sleep(1000);
    const status = statusFor(account, await readSession(win));
    if (status.signedIn) {
      if (!win.isDestroyed()) {
        win.close();
      }
      log.info("[pond bluesky] signed in for bookmarks", account.id);
      return { ok: true, handle: status.handle };
    }
    otherHandle = status.otherHandle;
  }
  if (!win.isDestroyed()) {
    win.close();
  }
  return otherHandle
    ? { ok: false, reason: "other_account", otherHandle }
    : { ok: false, reason: "cancelled", otherHandle: null };
}

/** Clears only bsky.app's storage, so likes keep syncing by handle. */
export async function signOutOfBluesky(
  account: ConnectedAccount,
): Promise<void> {
  await session
    .fromPartition(partitionForAccount(account.id))
    .clearStorageData({
      origin: WEB,
      storages: ["localstorage", "indexdb", "cookies", "serviceworkers"],
    });
}
