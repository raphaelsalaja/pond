import type { ConnectedAccount, Source } from "@pond/schema/db";
import type { ExtensionCookie } from "@pond/schema/session";
import { describe, expect, it } from "vitest";
import { createSessionRefresh } from "./session-refresh";

function youtubeAccount(id: string, handle: string | null): ConnectedAccount {
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
  accounts: Array<ConnectedAccount>;
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
  const probes: Array<Source> = [];
  const writes: Array<[ConnectedAccount, Array<ExtensionCookie>]> = [];
  const patches: Array<[ConnectedAccount, string]> = [];
  const signedIn: Array<ConnectedAccount> = [];
  const refresh = createSessionRefresh({
    listAccounts: async () => state.accounts,
    heldCookie: async (account) => state.held.get(account.id) ?? null,
    isConnected: async (account) => state.connected.has(account.id),
    isAuthCookie: (_source, name, value) =>
      value.length > 0 &&
      ["LOGIN_INFO", "auth_token", "user_session"].includes(name),
    probeHandle: async (source) => {
      probes.push(source);
      return state.probedHandle;
    },
    writeCookies: async (account, cookies) => {
      writes.push([account, cookies]);
    },
    patchHandle: async (account, handle) => {
      patches.push([account, handle]);
    },
    signedBackIn: (account) => {
      signedIn.push(account);
    },
  });
  return { refresh, probes, writes, patches, signedIn };
}

describe("createSessionRefresh", () => {
  it("reports untracked when no Account uses the Source", async () => {
    const { refresh, writes } = setup();
    await expect(refresh("youtube", rotated)).resolves.toEqual({
      tracked: false,
      refreshed: false,
    });
    expect(writes).toEqual([]);
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
    const { refresh, writes, signedIn, probes } = setup({
      accounts: [account],
      held: new Map([["a", "session-a"]]),
      connected: new Set(["a"]),
    });

    await expect(refresh("youtube", rotated)).resolves.toEqual({
      tracked: true,
      refreshed: true,
    });
    expect(writes).toContainEqual([account, rotated.slice(0, 3)]);
    expect(signedIn).toEqual([]);
    expect(probes).toEqual([]);
  });

  it("signs a signed-out Account back in when the handle matches", async () => {
    const account = youtubeAccount("a", "raphael");
    const { refresh, writes, signedIn } = setup({
      accounts: [account],
      probedHandle: "raphael",
    });

    await expect(refresh("youtube", rotated)).resolves.toEqual({
      tracked: true,
      refreshed: true,
    });
    expect(writes).toContainEqual([account, rotated.slice(0, 3)]);
    expect(signedIn).toContainEqual(account);
  });

  it("never hands a different sign-in to an Account, and stops probing it", async () => {
    const { refresh, writes, probes } = setup({
      accounts: [youtubeAccount("a", "raphael")],
      probedHandle: "someone-else",
    });

    await expect(refresh("youtube", rotated)).resolves.toEqual({
      tracked: true,
      refreshed: false,
    });
    await refresh("youtube", rotated);
    expect(writes).toEqual([]);
    expect(probes).toHaveLength(1);
  });

  it("adopts the sole signed-out Account that predates handle probing", async () => {
    const account = youtubeAccount("a", null);
    const { refresh, writes, patches, signedIn } = setup({
      accounts: [account],
      probedHandle: "raphael",
    });

    await expect(refresh("youtube", rotated)).resolves.toEqual({
      tracked: true,
      refreshed: true,
    });
    expect(patches).toContainEqual([account, "raphael"]);
    expect(writes).toContainEqual([
      { ...account, handle: "raphael" },
      rotated.slice(0, 3),
    ]);
    expect(signedIn).toContainEqual({
      ...account,
      handle: "raphael",
    });
  });

  it("does not adopt a sign-in when a second Account is also signed out", async () => {
    const { refresh, writes } = setup({
      accounts: [youtubeAccount("a", null), youtubeAccount("b", "raphael")],
      probedHandle: "someone-else",
    });

    await expect(refresh("youtube", rotated)).resolves.toEqual({
      tracked: true,
      refreshed: false,
    });
    expect(writes).toEqual([]);
  });

  it("does not adopt into a handle-less Account that has an identity key", async () => {
    const account = { ...youtubeAccount("a", null), identityKey: "123" };
    const { refresh, writes } = setup({
      accounts: [account],
      probedHandle: "raphael",
    });

    await expect(refresh("youtube", rotated)).resolves.toEqual({
      tracked: true,
      refreshed: false,
    });
    expect(writes).toEqual([]);
  });

  it("does not adopt a sign-in that a connected Account already claims", async () => {
    const { refresh, writes } = setup({
      accounts: [youtubeAccount("a", null), youtubeAccount("b", "raphael")],
      connected: new Set(["b"]),
      probedHandle: "raphael",
    });

    await expect(refresh("youtube", rotated)).resolves.toEqual({
      tracked: true,
      refreshed: false,
    });
    expect(writes).toEqual([]);
  });

  it("leaves a connected Account alone when another session rotates", async () => {
    const { refresh, writes, probes } = setup({
      accounts: [youtubeAccount("a", "raphael")],
      held: new Map([["a", "session-b"]]),
      connected: new Set(["a"]),
    });

    await expect(refresh("youtube", rotated)).resolves.toEqual({
      tracked: true,
      refreshed: false,
    });
    expect(writes).toEqual([]);
    expect(probes).toEqual([]);
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
      const { refresh, writes, probes } = setup({
        accounts: [account],
        held: new Map([[account.id, source.identity]]),
        connected: new Set([account.id]),
      });

      await expect(refresh(source.source, cookies)).resolves.toEqual({
        tracked: true,
        refreshed: true,
      });
      expect(writes).toContainEqual([account, cookies]);
      expect(probes).toEqual([]);
    });

    it("does not replace an Account with a different browser sign-in", async () => {
      const { refresh, writes, probes } = setup({
        accounts: [account],
        held: new Map([[account.id, "another-account"]]),
        connected: new Set([account.id]),
      });

      await expect(refresh(source.source, cookies)).resolves.toEqual({
        tracked: true,
        refreshed: false,
      });
      expect(writes).toEqual([]);
      expect(probes).toEqual([]);
    });

    it("does not add an Account that the user has not connected", async () => {
      const { refresh, writes } = setup();

      await expect(refresh(source.source, cookies)).resolves.toEqual({
        tracked: false,
        refreshed: false,
      });
      expect(writes).toEqual([]);
    });

    it("does not write an incomplete browser session", async () => {
      const { refresh, writes } = setup({
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
      expect(writes).toEqual([]);
    });
  });
});
