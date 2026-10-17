import type { ConnectedAccount } from "@pond/schema/db";
import { describe, expect, it, vi } from "vitest";
import {
  harvestConfiguredTwitterLikes,
  shouldHarvestTwitterLikes,
} from "./twitter-likes";

const account = {
  handle: "raphael",
  sync: {},
};

describe("shouldHarvestTwitterLikes", () => {
  it("harvests likes when the account has not opted out", () => {
    expect(shouldHarvestTwitterLikes(account, false)).toBe(true);
  });

  it("skips likes when the account turns them off", () => {
    expect(
      shouldHarvestTwitterLikes(
        { ...account, sync: { syncLikes: false } },
        false,
      ),
    ).toBe(false);
  });

  it("skips likes when the import scope leaves them out", () => {
    expect(
      shouldHarvestTwitterLikes(
        { ...account, sync: { importScope: { listKinds: ["saved"] } } },
        false,
      ),
    ).toBe(false);
  });

  it("skips likes without a handle or after cancel", () => {
    expect(shouldHarvestTwitterLikes({ ...account, handle: null }, false)).toBe(
      false,
    );
    expect(shouldHarvestTwitterLikes(account, true)).toBe(false);
  });
});

const connectedAccount: ConnectedAccount = {
  id: "twitter:123",
  source: "twitter",
  handle: "@raphael",
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

describe("harvestConfiguredTwitterLikes", () => {
  it("does not call the harvester when likes syncing is disabled", async () => {
    const harvestTwitterLikes = vi.fn();

    await expect(
      harvestConfiguredTwitterLikes(
        {
          ...connectedAccount,
          sync: { ...connectedAccount.sync, syncLikes: false },
        },
        { aborted: false, knownIds: ["1"], partition: "account:123" },
        { harvestTwitterLikes },
      ),
    ).resolves.toBeNull();
    expect(harvestTwitterLikes).not.toHaveBeenCalled();
  });

  it("defaults to enabled and returns the harvested likes", async () => {
    const result = {
      ok: true as const,
      entries: [],
      captures: [],
      reachedEnd: true,
    };
    const harvestTwitterLikes = vi.fn(async () => result);

    await expect(
      harvestConfiguredTwitterLikes(
        connectedAccount,
        { aborted: false, knownIds: ["1"], partition: "account:123" },
        { harvestTwitterLikes },
      ),
    ).resolves.toBe(result);
    expect(harvestTwitterLikes).toHaveBeenCalledWith(
      { knownIds: ["1"] },
      { partition: "account:123", handle: "raphael" },
    );
  });

  it("passes harvest failures through to the sync operation", async () => {
    const failure = { ok: false as const, reason: "rate_limited" as const };

    await expect(
      harvestConfiguredTwitterLikes(
        connectedAccount,
        { aborted: false, knownIds: [], partition: "account:123" },
        { harvestTwitterLikes: vi.fn(async () => failure) },
      ),
    ).resolves.toBe(failure);
  });
});
