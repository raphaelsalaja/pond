import type { WireSyncAction } from "@shared/wire";
import { Store } from "@tanstack/store";
import log from "electron-log/renderer";
import {
  normalise,
  SyncActionEventSchema,
} from "@/features/saves/lib/reconcile";
import type { SavePatch } from "@/features/saves/lib/reconcile";
import { bulkUpsertSaves, deleteSave, pool } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";
import type { readSnapshot } from "../lib/snapshot";
import type { applyActionCoalesced } from "../lib/sync-coalesce";

export interface SaveBootstrapDependencies {
  readSnapshot: typeof readSnapshot;
  scheduleSnapshotWrite(): void;
  applyActionCoalesced: typeof applyActionCoalesced;
  rendererReady(): void;
  onSyncAction(callback: (action: WireSyncAction) => void): void;
  loadAll(): Promise<Array<SavePatch | null>>;
  loadPage(params: {
    limit: number;
    cursor?: { savedAt: number; id: string };
  }): Promise<{
    rows: Array<SavePatch | null>;
    nextCursor?: { savedAt: number; id: string } | null;
    total?: number | null;
  }>;
}

export type SavePageCursor = {
  readonly savedAt: number;
  readonly id: string;
};

export interface PagingState {
  readonly ready: boolean;
  readonly loading: boolean;
  readonly loaded: number;
  readonly total: number;
  readonly nextCursor: SavePageCursor | null;
  readonly hasMore: boolean;
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause: unknown) => {
        clearTimeout(timer);
        reject(cause);
      },
    );
  });
}

function applyListRows(
  rows: Array<SavePatch | null>,
  opts: { pruneMissing?: boolean } = {},
): Array<Save> {
  const fresh = rows.flatMap((row) => {
    const save = normalise(row);
    return save === null ? [] : [save];
  });
  if (opts.pruneMissing) {
    const freshIds = new Set(fresh.map((save) => save.id));
    for (const id of pool.ids()) {
      if (!freshIds.has(id)) {
        deleteSave(id);
      }
    }
  }
  bulkUpsertSaves(fresh);
  return fresh;
}

export function createSaveBootstrap(dependencies: SaveBootstrapDependencies) {
  const SNAPSHOT_TIMEOUT_MS = 2000;
  const FIRST_PAGE_TIMEOUT_MS = 4000;

  const pagingStore = new Store<PagingState>({
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

  function bootPool(): Promise<void> {
    if (bootPromise) return bootPromise;
    if (started) return Promise.resolve();
    started = true;

    bootPromise = (async () => {
      try {
        subscribeToSyncActions();
      } catch (error) {
        log.warn("[pond pool] sync subscribe failed", error);
      }
      try {
        await withTimeout(
          primeSnapshot(),
          SNAPSHOT_TIMEOUT_MS,
          "snapshot prime",
        );
      } catch (error) {
        log.warn("[pond pool] snapshot prime failed", error);
      }

      try {
        await withTimeout(
          loadNextPage(),
          FIRST_PAGE_TIMEOUT_MS,
          "initial page hydrate",
        );
      } catch (error) {
        log.warn("[pond pool] initial page hydrate failed", error);
      }
      dependencies.scheduleSnapshotWrite();
      pagingStore.setState((state) => ({ ...state, ready: true }));
      dependencies.rendererReady();
    })();

    return bootPromise;
  }

  async function primeSnapshot(): Promise<void> {
    const cached = await dependencies.readSnapshot();
    const usable = cached.filter((row) => row?.url);
    applyListRows(usable.slice(0, PAGE_SIZE));
  }

  function loadNextPage(): Promise<void> {
    if (fullPoolInflight) return fullPoolInflight;
    if (pageInflight) return pageInflight;
    if (!pagingStore.state.hasMore) return Promise.resolve();

    pageInflight = fetchPage(pagingStore.state.nextCursor).finally(() => {
      pageInflight = null;
    });
    return pageInflight;
  }

  function hydrateFullPool(): Promise<void> {
    if (fullPoolInflight) return fullPoolInflight;
    if (!pagingStore.state.hasMore) return Promise.resolve();

    fullPoolInflight = (async () => {
      const activePage = pageInflight;
      if (activePage) {
        try {
          await activePage;
        } catch {
          /** A failed page doesn't block the full load, which fetches every row anyway. */
        }
      }

      pagingStore.setState((state) => ({ ...state, loading: true }));
      const rows = await dependencies.loadAll();
      const fresh = applyListRows(rows, { pruneMissing: true });
      dependencies.scheduleSnapshotWrite();
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

  async function fetchPage(cursor: SavePageCursor | null): Promise<void> {
    pagingStore.setState((state) => ({ ...state, loading: true }));
    try {
      const params = cursor
        ? { limit: PAGE_SIZE, cursor }
        : { limit: PAGE_SIZE };
      const page = await dependencies.loadPage(params);
      const fresh = applyListRows(page.rows);
      const nextCursor = page.nextCursor ?? null;
      pagingStore.setState((state) => ({
        ...state,
        loaded: state.loaded + fresh.length,
        total:
          page.total !== undefined &&
          page.total !== null &&
          Number.isFinite(page.total)
            ? page.total
            : state.total,
        nextCursor,
        hasMore: nextCursor !== null,
      }));
    } finally {
      pagingStore.setState((state) => ({ ...state, loading: false }));
    }
  }

  let subscribedToSync = false;

  function subscribeToSyncActions(): void {
    if (subscribedToSync) return;
    dependencies.onSyncAction((raw) => {
      try {
        const event = SyncActionEventSchema.safeParse(raw);
        if (event.success) dependencies.applyActionCoalesced(event.data);
        dependencies.scheduleSnapshotWrite();
      } catch (error) {
        log.warn("[pond pool] applyAction failed", error, raw);
      }
    });
    subscribedToSync = true;
  }

  return { pagingStore, bootPool, loadNextPage, hydrateFullPool };
}
