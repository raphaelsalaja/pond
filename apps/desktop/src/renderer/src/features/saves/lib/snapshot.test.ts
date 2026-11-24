import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Rows = Map<string, unknown>;

interface FakeRequest {
  result?: unknown;
  error: null;
  onsuccess?: () => void;
  onupgradeneeded?: () => void;
}

/** Just enough IndexedDB for the snapshot: named databases holding one store of rows. */
function createIndexedDb(databases: Map<string, Rows>) {
  function database(rows: Rows) {
    return {
      objectStoreNames: { contains: () => true },
      createObjectStore: () => undefined,
      transaction: () => ({
        objectStore: () => ({
          getAll() {
            const request: FakeRequest = { error: null };
            setTimeout(() => {
              request.result = [...rows.values()];
              request.onsuccess?.();
            });
            return request;
          },
        }),
      }),
    };
  }

  return {
    deleteDatabase(name: string) {
      databases.delete(name);
      return {};
    },
    open(name: string) {
      const request: FakeRequest = { error: null };
      setTimeout(() => {
        const created = !databases.has(name);
        const rows = databases.get(name) ?? new Map();
        databases.set(name, rows);
        request.result = database(rows);
        if (created) {
          request.onupgradeneeded?.();
        }
        request.onsuccess?.();
      });
      return request;
    },
  };
}

let databases: Map<string, Rows>;

async function readSnapshotIn(libraryId: string) {
  vi.stubGlobal("window", { pond: { libraryId: () => libraryId } });
  vi.resetModules();
  const { readSnapshot } = await import("./snapshot");
  return readSnapshot();
}

beforeEach(() => {
  databases = new Map();
  vi.stubGlobal("indexedDB", createIndexedDb(databases));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("save snapshot", () => {
  it("reads only the open Library's Saves", async () => {
    databases.set(
      "pond-pool:library-a",
      new Map([["save-a", { id: "save-a", url: "https://a.example" }]]),
    );

    await expect(readSnapshotIn("library-b")).resolves.toEqual([]);
    await expect(readSnapshotIn("library-a")).resolves.toMatchObject([
      { id: "save-a", url: "https://a.example" },
    ]);
  });

  it("drops the snapshot that has no Library id", async () => {
    databases.set(
      "pond-pool",
      new Map([["save-old", { id: "save-old", url: "https://old.example" }]]),
    );

    await expect(readSnapshotIn("library-b")).resolves.toEqual([]);
    expect(databases.has("pond-pool")).toBe(false);
  });
});
