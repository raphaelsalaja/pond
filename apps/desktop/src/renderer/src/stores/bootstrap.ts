import { Store } from "@tanstack/store";
import { normalise, type SyncActionEvent } from "@/lib/save/reconcile";
import { readSnapshot, scheduleSnapshotWrite } from "@/lib/save/snapshot";
import { applyActionCoalesced } from "@/lib/save/sync-coalesce";
import type { Save } from "@/lib/types";
import { bulkUpsertSaves, deleteSave, pool } from "@/stores/pool";

export interface SavePageCursor {
  readonly savedAt: number;
  readonly id: string;
}

interface PagingState {
  readonly ready: boolean;
  readonly loading: boolean;
  readonly loaded: number;
  readonly total: number;
  readonly nextCursor: SavePageCursor | null;
  readonly hasMore: boolean;
}

export const pagingStore = new Store<PagingState>({
  ready: false,
  loading: false,
  loaded: 0,
  total: 0,
  nextCursor: null,
  hasMore: true,
});

const PAGE_SIZE = 250;

let started = false;
let bootPromise: Promise<void> | null = null;
let pageInflight: Promise<void> | null = null;
let fullPoolInflight: Promise<void> | null = null;

export function bootPool(): Promise<void> {
  if (bootPromise) return bootPromise;
  if (started) return Promise.resolve();
  started = true;

  bootPromise = (async () => {
    subscribeToSyncActions();
    try {
      await primeSnapshot();
    } catch (err) {
      console.warn("[pond pool] snapshot prime failed", err);
    }

    try {
      await loadNextPage();
    } catch (err) {
      console.warn("[pond pool] initial page hydrate failed", err);
    }
    scheduleSnapshotWrite();
    pagingStore.setState((state) => ({ ...state, ready: true }));
  })();

  return bootPromise;
}

/** Paint the bounded cached page before SQLite responds. The live first page reconciles it. */
async function primeSnapshot(): Promise<void> {
  const cached = await readSnapshot();
  applyListRows(cached.slice(0, PAGE_SIZE));
}

export function loadNextPage(): Promise<void> {
  /** A full hydrate supersedes every cursor page, including a page requested while it is running. */
  if (fullPoolInflight) return fullPoolInflight;
  if (pageInflight) return pageInflight;
  if (!pagingStore.state.hasMore) return Promise.resolve();

  pageInflight = fetchPage(pagingStore.state.nextCursor).finally(() => {
    pageInflight = null;
  });
  return pageInflight;
}

/**
 * Loads the complete pool only for views whose filters cannot be exact from a
 * recency page. Callers may safely invoke this repeatedly; concurrent calls
 * share one request and no cursor pages can resume once it completes.
 */
export function hydrateFullPool(): Promise<void> {
  if (fullPoolInflight) return fullPoolInflight;
  if (!pagingStore.state.hasMore) return Promise.resolve();

  fullPoolInflight = (async () => {
    /** Let a page already requested finish first, so its final state cannot overwrite the complete state below. */
    const activePage = pageInflight;
    if (activePage) {
      try {
        await activePage;
      } catch {
        /** The full query below can still recover from an individual page failure. */
      }
    }

    pagingStore.setState((state) => ({ ...state, loading: true }));
    const rows = (await window.pond.query("saves.list", {})) as Array<
      Partial<Save>
    >;
    const fresh = applyListRows(rows, { pruneMissing: true });
    scheduleSnapshotWrite();
    pagingStore.setState((state) => ({
      ...state,
      loaded: fresh.length,
      total: fresh.length,
      nextCursor: null,
      hasMore: false,
    }));
  })().finally(() => {
    fullPoolInflight = null;
    pagingStore.setState((state) => ({ ...state, loading: false }));
  });

  return fullPoolInflight;
}

interface SavePage {
  readonly rows: Array<Partial<Save>>;
  readonly nextCursor: SavePageCursor | null;
  readonly total: number;
}

async function fetchPage(cursor: SavePageCursor | null): Promise<void> {
  pagingStore.setState((state) => ({ ...state, loading: true }));
  try {
    const params = cursor ? { limit: PAGE_SIZE, cursor } : { limit: PAGE_SIZE };
    const page = (await window.pond.query(
      "saves.listPage",
      params,
    )) as SavePage;
    const fresh = applyListRows(page.rows);
    const nextCursor = page.nextCursor ?? null;
    pagingStore.setState((state) => ({
      ...state,
      loaded: state.loaded + fresh.length,
      total: Number.isFinite(page.total) ? page.total : state.total,
      nextCursor,
      hasMore: nextCursor !== null,
    }));
  } finally {
    pagingStore.setState((state) => ({ ...state, loading: false }));
  }
}

function applyListRows(
  rows: Array<Partial<Save>>,
  opts: { pruneMissing?: boolean } = {},
): Save[] {
  const fresh = rows
    .map((row) => normalise(row))
    .filter((r): r is Save => r !== null);
  if (opts.pruneMissing) {
    const freshIds = new Set(fresh.map((save) => save.id));
    for (const id of pool.ids()) {
      if (!freshIds.has(id)) deleteSave(id);
    }
  }
  bulkUpsertSaves(fresh);
  return fresh;
}

let subscribedToSync = false;

function subscribeToSyncActions(): void {
  if (subscribedToSync) return;
  window.pond.onSyncAction((raw) => {
    try {
      applyActionCoalesced(raw as SyncActionEvent);
      scheduleSnapshotWrite();
    } catch (err) {
      console.warn("[pond pool] applyAction failed", err, raw);
    }
  });
  subscribedToSync = true;
}

export async function optimistic<T>(
  optimisticUpdate: () => void,
  rollback: () => void,
  run: () => Promise<T>,
): Promise<T | null> {
  optimisticUpdate();
  try {
    return await run();
  } catch (err) {
    console.warn("[pond pool] tx failed, rolling back", err);
    rollback();
    return null;
  }
}
