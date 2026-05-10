import type { Save } from "./types";

/**
 * IndexedDB-backed mirror of the renderer's in-memory `PondPool`.
 *
 * Why this exists: the canonical store lives in main (SQLite). On every
 * boot the renderer used to wait for an IPC round-trip to that store
 * before painting the library. With a cache the *first* paint on every
 * subsequent launch comes from IndexedDB — same machine, no IPC, same
 * frame — and the SQLite read becomes a background reconciliation pass
 * that quietly applies any deletes / updates the user made through
 * another window or that landed via `sync-action` while the app was
 * closed. Same pattern Linear uses: in-memory pool over a local store,
 * background delta sync against the durable source.
 *
 * Single object store keyed by `Save.id`. We don't keep a version
 * cursor here — the SQLite read is the source of truth on boot, so the
 * "delta" we apply is simply the diff between the cache and that
 * snapshot.
 */

const DB_NAME = "pond-pool";
const STORE_SAVES = "saves";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, VERSION);
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SAVES)) {
        db.createObjectStore(STORE_SAVES, { keyPath: "id" });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // If a future schema upgrade is started by another tab, reset the
      // cached connection so the next call re-opens cleanly.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
    req.onblocked = () =>
      reject(new Error("indexedDB open blocked by another connection"));
  }).catch((err) => {
    // Force the next call to retry; a one-shot failure (e.g. quota
    // hiccup, private-browsing IDB lockout) shouldn't permanently
    // disable the cache.
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE_SAVES, mode).objectStore(STORE_SAVES);
}

function awaitTx(store: IDBObjectStore): Promise<void> {
  return new Promise((resolve, reject) => {
    store.transaction.oncomplete = () => resolve();
    store.transaction.onerror = () =>
      reject(store.transaction.error ?? new Error("idb tx failed"));
    store.transaction.onabort = () =>
      reject(store.transaction.error ?? new Error("idb tx aborted"));
  });
}

export async function loadAllFromCache(): Promise<Save[]> {
  const db = await open();
  return new Promise<Save[]>((resolve, reject) => {
    const store = tx(db, "readonly");
    const req = store.getAll();
    req.onsuccess = () => resolve((req.result as Save[]) ?? []);
    req.onerror = () => reject(req.error ?? new Error("idb getAll failed"));
  });
}

export async function bulkPutCache(rows: readonly Save[]): Promise<void> {
  if (rows.length === 0) return;
  const db = await open();
  const store = tx(db, "readwrite");
  for (const row of rows) store.put(row);
  await awaitTx(store);
}

export async function bulkDeleteCache(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  const db = await open();
  const store = tx(db, "readwrite");
  for (const id of ids) store.delete(id);
  await awaitTx(store);
}

export async function clearCache(): Promise<void> {
  const db = await open();
  const store = tx(db, "readwrite");
  store.clear();
  await awaitTx(store);
}
