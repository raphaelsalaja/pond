import type {
  ConnectedAccount,
  ImportCollection,
  ImportScope,
  SourceSyncPrefs,
} from "@pond/schema/db";
import { describe, expect, it } from "vitest";
import { fileCapturedCollections } from "./captured-collections";
import type { CapturedCollectionDeps } from "./captured-collections";
import type { CollectionEntry } from "./collection-folders";

const SAVE = { source: "cosmos" as const, sourceId: "123" };
const MOODS = { id: "7", name: "Moods" };
const TYPE = { id: "9", name: "Type" };

function cosmos(
  id: string,
  importScope: ImportScope | undefined,
  sync: Partial<SourceSyncPrefs> = {},
): ConnectedAccount {
  return {
    id,
    source: "cosmos",
    handle: "jane",
    identityKey: "42",
    label: null,
    addedAt: "2026-11-01T00:00:00.000Z",
    sync: {
      lastSyncedAt: null,
      lastError: null,
      highWaterMark: null,
      lastFullSyncAt: null,
      knownCount: 0,
      runningSince: null,
      importScope,
      ...sync,
    },
  };
}

function deps(
  accounts: Array<ConnectedAccount>,
  listed: Array<ImportCollection> | null = [MOODS, TYPE],
) {
  const filed: Array<{
    accountId: string;
    entries: ReadonlyArray<CollectionEntry>;
    everyCollection: ReadonlyArray<ImportCollection>;
  }> = [];
  let listings = 0;
  const fake: CapturedCollectionDeps = {
    accounts: async (source) => accounts.filter((a) => a.source === source),
    async listCollections() {
      listings += 1;
      return listed;
    },
    async file(account, entries, everyCollection) {
      filed.push({ accountId: account.id, entries, everyCollection });
      return entries.length;
    },
  };
  return { fake, filed, listings: () => listings };
}

describe("fileCapturedCollections", () => {
  it("files into every collection the save was added to when Add to Folders is on", async () => {
    const { fake, filed } = deps([cosmos("a1", { addToFolders: true })]);

    await expect(fileCapturedCollections(SAVE, ["7", "9"], fake)).resolves.toBe(
      1,
    );
    expect(filed).toEqual([
      {
        accountId: "a1",
        entries: [{ sourceId: "123", collectionIds: ["7", "9"] }],
        everyCollection: [MOODS, TYPE],
      },
    ]);
  });

  it("skips reading the collection list when every Folder is already known", async () => {
    const { fake, filed, listings } = deps([
      cosmos(
        "a1",
        { addToFolders: true },
        { collectionFolders: { "7": "folder-moods" } },
      ),
    ]);

    await fileCapturedCollections(SAVE, ["7"], fake);
    expect(listings()).toBe(0);
    expect(filed[0]?.everyCollection).toEqual([{ id: "7", name: "7" }]);
  });

  it("leaves a collection it can't name for the next Sync", async () => {
    const { fake, filed } = deps([cosmos("a1", { addToFolders: true })], null);

    await expect(fileCapturedCollections(SAVE, ["7"], fake)).resolves.toBe(0);
    expect(filed).toEqual([]);
  });

  it("files into picked collections without reading the list", async () => {
    const { fake, filed, listings } = deps([
      cosmos("a1", { collections: [MOODS] }),
    ]);

    await fileCapturedCollections(SAVE, ["7", "9"], fake);
    expect(listings()).toBe(0);
    expect(filed).toEqual([
      {
        accountId: "a1",
        entries: [{ sourceId: "123", collectionIds: ["7", "9"] }],
        everyCollection: [],
      },
    ]);
  });

  it("does nothing while Add to Folders is off", async () => {
    const { fake, filed } = deps([cosmos("a1", undefined)]);

    await expect(fileCapturedCollections(SAVE, ["7"], fake)).resolves.toBe(0);
    expect(filed).toEqual([]);
  });

  it("does nothing when two Accounts could own the save", async () => {
    const { fake, filed } = deps([
      cosmos("a1", { addToFolders: true }),
      cosmos("a2", { addToFolders: true }),
    ]);

    await expect(fileCapturedCollections(SAVE, ["7"], fake)).resolves.toBe(0);
    expect(filed).toEqual([]);
  });
});
