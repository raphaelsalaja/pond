import type { ConnectedAccount, Source } from "@pond/schema/db";
import {
  type ExtensionCookie,
  ROTATING_SESSIONS,
  type SessionRefreshResponse,
} from "@pond/schema/session";

export interface SessionRefreshDeps {
  listAccounts: (source: Source) => Promise<ConnectedAccount[]>;
  heldCookie: (
    account: ConnectedAccount,
    name: string,
  ) => Promise<string | null>;
  isConnected: (account: ConnectedAccount) => Promise<boolean>;
  isAuthCookie: (source: Source, name: string, value: string) => boolean;
  probeHandle: (
    source: Source,
    cookies: ExtensionCookie[],
  ) => Promise<string | null>;
  writeCookies: (
    account: ConnectedAccount,
    cookies: ExtensionCookie[],
  ) => Promise<void>;
  signedBackIn: (account: ConnectedAccount) => void;
}

/** Follows a session your browser rotated, so the Account's copy never goes stale. */
export function createSessionRefresh(deps: SessionRefreshDeps) {
  /** Sessions already probed without matching an Account, so each rotation of a different sign-in skips the probe. */
  const unmatched = new Set<string>();

  /** Only an Account that lost its session and shows the same handle takes it back; a different sign-in never moves in. */
  async function signedOutAccountFor(
    source: Source,
    accounts: ConnectedAccount[],
    cookies: ExtensionCookie[],
  ): Promise<ConnectedAccount | null> {
    const signedOut: ConnectedAccount[] = [];
    for (const account of accounts) {
      if (account.handle && !(await deps.isConnected(account))) {
        signedOut.push(account);
      }
    }
    if (signedOut.length === 0) return null;
    const handle = await deps.probeHandle(source, cookies);
    if (!handle) return null;
    return signedOut.find((account) => account.handle === handle) ?? null;
  }

  return async function refresh(
    source: Source,
    cookies: ExtensionCookie[],
  ): Promise<SessionRefreshResponse> {
    const rotating = ROTATING_SESSIONS.get(source);
    const accounts = rotating ? await deps.listAccounts(source) : [];
    if (!rotating || accounts.length === 0) {
      return { tracked: false, refreshed: false };
    }
    const own = cookies.filter((cookie) => {
      const host = cookie.domain.replace(/^\./, "").toLowerCase();
      return host === rotating.domain || host.endsWith(`.${rotating.domain}`);
    });
    const sessionId = own.find(
      (cookie) => cookie.name === rotating.sessionId && cookie.value,
    )?.value;
    const signedIn = own.some((cookie) =>
      deps.isAuthCookie(source, cookie.name, cookie.value),
    );
    if (!sessionId || !signedIn) return { tracked: true, refreshed: false };

    let account: ConnectedAccount | null = null;
    for (const candidate of accounts) {
      if (
        (await deps.heldCookie(candidate, rotating.sessionId)) === sessionId
      ) {
        account = candidate;
        break;
      }
    }
    const revived = account === null;
    if (!account) {
      if (unmatched.has(sessionId)) return { tracked: true, refreshed: false };
      account = await signedOutAccountFor(source, accounts, own);
      if (!account) {
        unmatched.add(sessionId);
        return { tracked: true, refreshed: false };
      }
    }

    await deps.writeCookies(account, own);
    if (revived) deps.signedBackIn(account);
    return { tracked: true, refreshed: true };
  };
}
