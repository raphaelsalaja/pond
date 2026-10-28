import type { ConnectedAccount } from "@pond/schema/db";
import { describe, expect, it, vi } from "vitest";
import {
  createImportOptionsQuery,
  createSetImportScopeQuery,
} from "./accounts";

function account(source: ConnectedAccount["source"]): ConnectedAccount {
  return {
    id: `${source}:123`,
    source,
    handle: "raphael",
    identityKey: "123",
    label: null,
    addedAt: "2026-10-15T00:00:00.000Z",
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

describe("accounts.setImportScope", () => {
  it("confirms a pending Account with the chosen boards", async () => {
    const pending = account("pinterest");
    pending.sync.importPending = true;
    const patchAccountSync = vi.fn(async () => pending.sync);
    const releaseFilteredSaves = vi.fn(async () => 0);
    const operation = createSetImportScopeQuery({
      getAccount: vi.fn(async () => pending),
      patchAccountSync,
      releaseFilteredSaves,
    });

    await expect(
      operation({
        accountId: "pinterest:123",
        scope: { collections: [{ id: "915", name: "Design References" }] },
      }),
    ).resolves.toEqual({ ok: true });
    expect(patchAccountSync).toHaveBeenCalledWith("pinterest:123", {
      importScope: {
        collections: [{ id: "915", name: "Design References" }],
      },
      importPending: false,
      lastFullSyncAt: null,
      resumeCursor: null,
    });
    expect(releaseFilteredSaves).toHaveBeenCalledWith("pinterest:123");
  });

  it("keeps a pending Account waiting when the save doesn't start it", async () => {
    const pending = account("twitter");
    pending.sync.importPending = true;
    const patchAccountSync = vi.fn(async () => pending.sync);
    const operation = createSetImportScopeQuery({
      getAccount: vi.fn(async () => pending),
      patchAccountSync,
      releaseFilteredSaves: vi.fn(async () => 0),
    });

    await operation({
      accountId: "twitter:123",
      scope: { listKinds: ["saved"] },
      start: false,
    });
    expect(patchAccountSync).toHaveBeenCalledWith(
      "twitter:123",
      expect.not.objectContaining({ importPending: expect.anything() }),
    );
    expect(patchAccountSync).toHaveBeenCalledWith(
      "twitter:123",
      expect.objectContaining({ importScope: { listKinds: ["saved"] } }),
    );
  });

  it("stores everything for options the Source can't honor", async () => {
    const patchAccountSync = vi.fn(async () => account("threads").sync);
    const releaseFilteredSaves = vi.fn(async () => 0);
    const operation = createSetImportScopeQuery({
      getAccount: vi.fn(async () => account("threads")),
      patchAccountSync,
      releaseFilteredSaves,
    });

    await operation({
      accountId: "threads:123",
      scope: { listKinds: ["saved"] },
    });
    expect(patchAccountSync).toHaveBeenCalledWith("threads:123", {
      importScope: undefined,
      importPending: false,
    });
    expect(releaseFilteredSaves).not.toHaveBeenCalled();
  });

  it("carries a legacy X Likes opt-out into the scope", async () => {
    const legacy = account("twitter");
    legacy.sync.syncLikes = false;
    const patchAccountSync = vi.fn(async () => legacy.sync);
    const operation = createSetImportScopeQuery({
      getAccount: vi.fn(async () => legacy),
      patchAccountSync,
      releaseFilteredSaves: vi.fn(async () => 0),
    });

    await operation({
      accountId: "twitter:123",
      scope: { listKinds: ["saved"] },
    });
    expect(patchAccountSync).toHaveBeenCalledWith("twitter:123", {
      importScope: { listKinds: ["saved"] },
      importPending: false,
      syncLikes: undefined,
    });
  });

  it("rejects a date that isn't on the calendar", async () => {
    const patchAccountSync = vi.fn(async () => account("reddit").sync);
    const operation = createSetImportScopeQuery({
      getAccount: vi.fn(async () => account("reddit")),
      patchAccountSync,
      releaseFilteredSaves: vi.fn(async () => 0),
    });

    await expect(
      operation({ accountId: "reddit:123", scope: { since: "2026-02-30" } }),
    ).resolves.toEqual({
      ok: false,
      error: "Enter a real date to import from.",
    });
    expect(patchAccountSync).not.toHaveBeenCalled();
  });

  it("saves every list off on an Account that already imported", async () => {
    const patchAccountSync = vi.fn(async () => account("instagram").sync);
    const operation = createSetImportScopeQuery({
      getAccount: vi.fn(async () => account("instagram")),
      patchAccountSync,
      releaseFilteredSaves: vi.fn(async () => 0),
    });

    await expect(
      operation({ accountId: "instagram:123", scope: { listKinds: [] } }),
    ).resolves.toEqual({ ok: true });
    expect(patchAccountSync).toHaveBeenCalledOnce();
  });

  it("rejects starting a first import with every list off without writing", async () => {
    const patchAccountSync = vi.fn(async () => account("instagram").sync);
    const operation = createSetImportScopeQuery({
      getAccount: vi.fn(async () => account("instagram")),
      patchAccountSync,
      releaseFilteredSaves: vi.fn(),
    });

    await expect(
      operation({
        accountId: "instagram:123",
        scope: { listKinds: [] },
        start: true,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Choose at least one list to import.",
    });
    expect(patchAccountSync).not.toHaveBeenCalled();
  });

  it("rejects unknown lists at the query boundary", () => {
    const operation = createSetImportScopeQuery({
      getAccount: vi.fn(),
      patchAccountSync: vi.fn(),
      releaseFilteredSaves: vi.fn(),
    });
    expect(() =>
      operation.inputSchema.parse({
        accountId: "instagram:123",
        scope: { listKinds: ["reposted"] },
      }),
    ).toThrow();
  });
});

describe("accounts.importOptions", () => {
  it("returns no collections for Sources that import everything", async () => {
    const listSourceCollections = vi.fn();
    const operation = createImportOptionsQuery({
      getAccount: vi.fn(async () => account("reddit")),
      resolveAccountHandle: vi.fn(async () => "raphael"),
      listSourceCollections,
    });

    await expect(operation({ accountId: "reddit:123" })).resolves.toEqual({
      ok: true,
      collections: null,
    });
    expect(listSourceCollections).not.toHaveBeenCalled();
  });

  it("lists Pinterest boards through the Account's session", async () => {
    const listSourceCollections = vi.fn(async () => ({
      ok: true as const,
      collections: [{ id: "915", name: "Design References", itemCount: 42 }],
    }));
    const operation = createImportOptionsQuery({
      getAccount: vi.fn(async () => account("pinterest")),
      resolveAccountHandle: vi.fn(async () => "raphael"),
      listSourceCollections,
    });

    await expect(operation({ accountId: "pinterest:123" })).resolves.toEqual({
      ok: true,
      collections: [{ id: "915", name: "Design References", itemCount: 42 }],
    });
    expect(listSourceCollections).toHaveBeenCalledWith("pinterest", {
      partition: "persist:pond-acct-pinterest:123",
      accountKey: "raphael",
    });
  });

  it("explains a signed-out session", async () => {
    const operation = createImportOptionsQuery({
      getAccount: vi.fn(async () => account("pinterest")),
      resolveAccountHandle: vi.fn(async () => "raphael"),
      listSourceCollections: vi.fn(async () => ({
        ok: false as const,
        reason: "auth_required" as const,
      })),
    });

    await expect(operation({ accountId: "pinterest:123" })).resolves.toEqual({
      ok: false,
      error:
        "Pinterest signed you out. Reconnect the Account to load your boards.",
    });
  });

  it("lists Instagram collections without looking up the username", async () => {
    const listSourceCollections = vi.fn(async () => ({
      ok: true as const,
      collections: [{ id: "c1", name: "Recipes", itemCount: 3 }],
    }));
    const resolveAccountHandle = vi.fn(async () => null);
    const operation = createImportOptionsQuery({
      getAccount: vi.fn(async () => account("instagram")),
      resolveAccountHandle,
      listSourceCollections,
    });

    await expect(operation({ accountId: "instagram:123" })).resolves.toEqual({
      ok: true,
      collections: [{ id: "c1", name: "Recipes", itemCount: 3 }],
    });
    expect(resolveAccountHandle).not.toHaveBeenCalled();
    expect(listSourceCollections).toHaveBeenCalledWith("instagram", {
      partition: "persist:pond-acct-instagram:123",
      accountKey: undefined,
    });
  });

  it("asks for a TikTok username before reading collections", async () => {
    const listSourceCollections = vi.fn();
    const operation = createImportOptionsQuery({
      getAccount: vi.fn(async () => account("tiktok")),
      resolveAccountHandle: vi.fn(async () => null),
      listSourceCollections,
    });

    await expect(operation({ accountId: "tiktok:123" })).resolves.toEqual({
      ok: false,
      error:
        "Pond couldn't find your TikTok username. Reconnect the Account and try again.",
    });
    expect(listSourceCollections).not.toHaveBeenCalled();
  });

  it("explains an Instagram checkpoint", async () => {
    const operation = createImportOptionsQuery({
      getAccount: vi.fn(async () => account("instagram")),
      resolveAccountHandle: vi.fn(async () => null),
      listSourceCollections: vi.fn(async () => ({
        ok: false as const,
        reason: "checkpoint" as const,
      })),
    });

    await expect(operation({ accountId: "instagram:123" })).resolves.toEqual({
      ok: false,
      error:
        "Instagram wants you to confirm your account. Open Instagram in your browser, then try again.",
    });
  });
});
