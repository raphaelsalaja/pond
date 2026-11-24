import { debounce } from "@tanstack/pacer";
import log from "electron-log/renderer";
import { SavePatchesSchema } from "@/features/saves/lib/reconcile";
import type { SavePatch } from "@/features/saves/lib/reconcile";
import { pool } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";
import { libraryScopedKey } from "@/shared/lib/library-scope";

const DB_BASE_NAME = "pond-pool";
const STORE = "snapshot";
const VERSION = 1;
const SNAPSHOT_LIMIT = 250;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) {
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    try {
      /** An unscoped snapshot can hold another Library's Saves, so it is never read. */
      indexedDB.deleteDatabase(DB_BASE_NAME);
      const req = indexedDB.open(libraryScopedKey(DB_BASE_NAME), VERSION);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("indexedDB blocked"));
    } catch (error) {
      reject(error);
    }
  });
  return dbPromise;
}

export async function readSnapshot(): Promise<Array<SavePatch | null>> {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, "readonly");
    const store = tx.objectStore(STORE);
    return await new Promise<Array<SavePatch | null>>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(SavePatchesSchema.parse(req.result ?? []));
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    log.warn("[pond pool] snapshot read failed", error);
    return [];
  }
}

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
      for (const save of saves) {
        store.put(save);
      }
    });
  } catch (error) {
    log.warn("[pond pool] snapshot write failed", error);
  }
}
