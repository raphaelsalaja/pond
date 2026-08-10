import { debounce } from "@tanstack/pacer";
import type { Save } from "@/lib/types";
import { pool } from "@/stores/pool";

/** Cold-start cache so the grid paints before the first SQLite page returns. */
const DB_NAME = "pond-pool";
const STORE = "snapshot";
const VERSION = 1;
export const SNAPSHOT_LIMIT = 250;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("indexedDB blocked"));
    } catch (err) {
      reject(err);
    }
  });
  return dbPromise;
}

export async function readSnapshot(): Promise<Save[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    return await new Promise<Save[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as Save[]) ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[pond pool] snapshot read failed", err);
    return [];
  }
}

/** Coalesces bursts of writes, e.g. a 50-tx batch, into one flush. */
const WRITE_DEBOUNCE_MS = 2000;

export const scheduleSnapshotWrite = debounce(
  () => {
    void writeSnapshot(pool.snapshot().slice(0, SNAPSHOT_LIMIT));
  },
  { wait: WRITE_DEBOUNCE_MS },
);

async function writeSnapshot(saves: ReadonlyArray<Save>): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
      const store = tx.objectStore(STORE);
      store.clear();
      for (const save of saves) store.put(save);
    });
  } catch (err) {
    console.warn("[pond pool] snapshot write failed", err);
  }
}
