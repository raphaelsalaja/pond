import { describe, expect, it, vi } from "vitest";
import { bridge } from "@/shared/test/pond-bridge";
import { readSnapshot } from "./snapshot";

function settled<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function seed(name: string, row: { id: string; url: string }) {
  const open = indexedDB.open(name, 1);
  open.onupgradeneeded = () => {
    open.result.createObjectStore("snapshot", { keyPath: "id" });
  };
  const db = await settled(open);
  const tx = db.transaction("snapshot", "readwrite");
  tx.objectStore("snapshot").put(row);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** Browser IndexedDB outlives each test, so every test opens Libraries no other test has used. */
function libraryIds() {
  const run = crypto.randomUUID();
  return { a: `library-a-${run}`, b: `library-b-${run}` };
}

function readSnapshotIn(libraryId: string) {
  bridge.use({ libraryId: () => libraryId });
  return readSnapshot();
}

describe("save snapshot", () => {
  it("reads only the open Library's Saves", async () => {
    const libraries = libraryIds();
    await seed(`pond-pool:${libraries.a}`, {
      id: "save-a",
      url: "https://a.example",
    });

    await expect(readSnapshotIn(libraries.b)).resolves.toEqual([]);
    await expect(readSnapshotIn(libraries.a)).resolves.toMatchObject([
      { id: "save-a", url: "https://a.example" },
    ]);
  });

  it("drops the snapshot that has no Library id", async () => {
    await seed("pond-pool", { id: "save-old", url: "https://old.example" });

    await expect(readSnapshotIn(libraryIds().b)).resolves.toEqual([]);
    await vi.waitFor(async () => {
      const names = (await indexedDB.databases()).map(({ name }) => name);
      expect(names).not.toContain("pond-pool");
    });
  });
});
