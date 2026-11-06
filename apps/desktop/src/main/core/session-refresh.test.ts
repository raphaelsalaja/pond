import type { ConnectedAccount } from "@pond/schema/db";
import type { ExtensionCookie } from "@pond/schema/session";
import { describe, expect, it, vi } from "vitest";
import { createSessionRefresh } from "./session-refresh";

function youtubeAccount(id: string, handle: string): ConnectedAccount {
  return {
    id,
    source: "youtube",
    handle,
    identityKey: null,
    label: null,
    addedAt: "2026-11-01T00:00:00.000Z",
    sync: {
      lastSyncedAt: null,
      lastError: null,
      highWaterMark: null,
      lastFullSyncAt: null,
      knownCount: 0,
      runningSince: null,
    },
  };
}

function cookie(
  name: string,
  value: string,
  domain = ".youtube.com",
): ExtensionCookie {
  return {
    name,
    value,
    domain,
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "unspecified",
  };
}

const rotated = [
  cookie("SID", "session-a"),
  cookie("LOGIN_INFO", "login"),
  cookie("__Secure-3PSIDTS", "fresh"),
  cookie("SID", "session-a", ".google.com"),
];

interface Pond {
  accounts: ConnectedAccount[];
  /** The `SID` each Account's partition holds. */
  held: Map<string, string>;
  connected: Set<string>;
  probedHandle: string | null;
}

function setup(pond: Partial<Pond> = {}) {
  const state: Pond = {
    accounts: [],
    held: new Map(),
    connected: new Set(),
    probedHandle: null,
    ...pond,
  };
  const probeHandle = vi.fn(async () => state.probedHandle);
  const writeCookies = vi.fn(async () => {});
  const signedBackIn = vi.fn();
  const refresh = createSessionRefresh({
    listAccounts: async () => state.accounts,
    heldCookie: async (account) => state.held.get(account.id) ?? null,
    isConnected: async (account) => state.connected.has(account.id),
    isAuthCookie: (_source, name, value) =>
      value.length > 0 &&
      ["LOGIN_INFO", "auth_token", "user_session"].includes(name),
    probeHandle,
    writeCookies,
    signedBackIn,
  });
  return { refresh, probeHandle, writeCookies, signedBackIn };
}

describe("createSessionRefresh", () => {
  it("reports untracked when no Account uses the Source", async () => {
    const { refresh, writeCookies } = setup();
    await expect(refresh("youtube", rotated)).resolves.toEqual({
      tracked: false,
      refreshed: false,
    });
    expect(writeCookies).not.toHaveBeenCalled();
  });

  it("ignores a Source whose session never rotates", async () => {
    const { refresh } = setup({ accounts: [youtubeAccount("a", "raphael")] });
    await expect(refresh("instagram", rotated)).resolves.toEqual({
      tracked: false,
      refreshed: false,
    });
  });

  it("writes a rotation into the Account holding the same session", async () => {
    const account = youtubeAccount("a", "raphael");
    const { refresh, writeCookies, signedBackIn, probeHandle } = setup({
      accounts: [account],
      held: new Map([["a", "session-a"]]),
      connected: new Set(["a"]),
    });

    await expect(refresh("youtube", rotated)).resolves.toEqual({
      tracked: true,
      refreshed: true,
    });
    expect(writeCookies).toHaveBeenCalledWith(account, rotated.slice(0, 3));
    expect(signedBackIn).not.toHaveBeenCalled();
    expect(probeHandle).not.toHaveBeenCalled();
  });

  it("signs a signed-out Account back in when the handle matches", async () => {
    const account = youtubeAccount("a", "raphael");
    const { refresh, writeCookies, signedBackIn } = setup({
      accounts: [account],
      probedHandle: "raphael",
    });

    await expect(refresh("youtube", rotated)).resolves.toEqual({
      tracked: true,
      refreshed: true,
    });
    expect(writeCookies).toHaveBeenCalledWith(account, rotated.slice(0, 3));
    expect(signedBackIn).toHaveBeenCalledWith(account);
  });

  it("never hands a different sign-in to an Account, and stops probing it", async () => {
    const { refresh, writeCookies, probeHandle } = setup({
      accounts: [youtubeAccount("a", "raphael")],
      probedHandle: "someone-else",
    });

    await expect(refresh("youtube", rotated)).resolves.toEqual({
      tracked: true,
      refreshed: false,
    });
    await refresh("youtube", rotated);
    expect(writeCookies).not.toHaveBeenCalled();
    expect(probeHandle).toHaveBeenCalledTimes(1);
  });

  it("leaves a connected Account alone when another session rotates", async () => {
    const { refresh, writeCookies, probeHandle } = setup({
      accounts: [youtubeAccount("a", "raphael")],
      held: new Map([["a", "session-b"]]),
      connected: new Set(["a"]),
    });

    await expect(refresh("youtube", rotated)).resolves.toEqual({
      tracked: true,
      refreshed: false,
    });
    expect(writeCookies).not.toHaveBeenCalled();
    expect(probeHandle).not.toHaveBeenCalled();
  });

  describe.each([
    {
      source: "twitter" as const,
      domain: ".x.com",
      identityCookie: "twid",
      identity: "u%3D123",
      authCookie: "auth_token",
    },
    {
      source: "github" as const,
      domain: ".github.com",
      identityCookie: "dotcom_user",
      identity: "raphael",
      authCookie: "user_session",
    },
  ])("$source browser sessions", (source) => {
    const cookies = [
      cookie(source.identityCookie, source.identity, source.domain),
      cookie(source.authCookie, "fresh-session", source.domain),
    ];
    const account = {
      ...youtubeAccount("a", "raphael"),
      source: source.source,
    };

    it("refreshes only the Account with the same identity cookie", async () => {
      const { refresh, writeCookies, probeHandle } = setup({
        accounts: [account],
        held: new Map([[account.id, source.identity]]),
        connected: new Set([account.id]),
      });

      await expect(refresh(source.source, cookies)).resolves.toEqual({
        tracked: true,
        refreshed: true,
      });
      expect(writeCookies).toHaveBeenCalledWith(account, cookies);
      expect(probeHandle).not.toHaveBeenCalled();
    });

    it("does not replace an Account with a different browser sign-in", async () => {
      const { refresh, writeCookies, probeHandle } = setup({
        accounts: [account],
        held: new Map([[account.id, "another-account"]]),
        connected: new Set([account.id]),
      });

      await expect(refresh(source.source, cookies)).resolves.toEqual({
        tracked: true,
        refreshed: false,
      });
      expect(writeCookies).not.toHaveBeenCalled();
      expect(probeHandle).not.toHaveBeenCalled();
    });

    it("does not add an Account that the user has not connected", async () => {
      const { refresh, writeCookies } = setup();

      await expect(refresh(source.source, cookies)).resolves.toEqual({
        tracked: false,
        refreshed: false,
      });
      expect(writeCookies).not.toHaveBeenCalled();
    });

    it("does not write an incomplete browser session", async () => {
      const { refresh, writeCookies } = setup({
        accounts: [account],
        held: new Map([[account.id, source.identity]]),
      });

      for (const requiredCookie of cookies) {
        await expect(refresh(source.source, [requiredCookie])).resolves.toEqual(
          {
            tracked: true,
            refreshed: false,
          },
        );
      }
      expect(writeCookies).not.toHaveBeenCalled();
    });
  });
});
