import { SOURCES } from "@pond/schema/db";
import type { Source, WatchKind } from "@pond/schema/db";
import { WATCH_KINDS } from "@pond/schema/watches";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { useEffect } from "react";
import { z } from "zod";
import { SOURCE_FETCH_PREF_FIELDS } from "@/features/sources/lib/fetch-prefs";
import type { SourceFetchPrefs } from "@/features/sources/lib/fetch-prefs";
import { syncMonitor } from "@/features/sources/state/sync-monitor";
import type { SyncAccountStatus } from "@/features/sources/state/sync-monitor";

export interface WatchRow {
  id: string;
  source: Source;
  handle: string;
  kind?: WatchKind;
  label: string | null;
  avatarUrl?: string | null;
  via: string | null;
  addedAt: string;
  sync: SourceFetchPrefs & {
    lastSyncedAt: string | null;
    lastError: string | null;
    knownCount: number;
  };
  syncing: boolean;
}

const WatchesReplySchema = z
  .object({
    watches: z
      .array(
        z.object({
          id: z.string(),
          source: z.enum(SOURCES),
          handle: z.string().catch(""),
          kind: z.enum(WATCH_KINDS).optional().catch(undefined),
          label: z.string().nullable().catch(null),
          avatarUrl: z.string().nullable().optional().catch(null),
          via: z.string().nullable().catch(null),
          addedAt: z.string().catch(""),
          sync: z
            .object({
              lastSyncedAt: z.string().nullable().catch(null),
              lastError: z.string().nullable().catch(null),
              knownCount: z.number().catch(0),
              ...SOURCE_FETCH_PREF_FIELDS,
            })
            .catch({ lastSyncedAt: null, lastError: null, knownCount: 0 }),
          syncing: z.boolean().catch(false),
        }),
      )
      .catch([]),
  })
  .catch({ watches: [] });

interface WatchesState {
  watches: Array<WatchRow>;
  loaded: boolean;
}

const store = new Store<WatchesState>({ watches: [], loaded: false });

interface WatchesResult {
  watches: Array<WatchRow>;
  loading: boolean;
  refetch: () => Promise<Array<WatchRow>>;
}

async function refetchWatches(): Promise<Array<WatchRow>> {
  try {
    const rows = WatchesReplySchema.parse(
      await window.pond.query("watches.list", {}),
    ).watches;
    store.setState(() => ({ watches: rows, loaded: true }));
    for (const watch of rows) {
      const status: Partial<SyncAccountStatus> = {
        connected: true,
        lastSyncedAt: watch.sync.lastSyncedAt,
        lastError: watch.sync.lastError,
      };
      if (watch.syncing) {
        status.state = "running";
      }
      syncMonitor.seed(watch.id, watch.source, status);
    }
    return rows;
  } catch {
    store.setState((s) => ({ ...s, loaded: true }));
    return [];
  }
}

export function useWatches(): WatchesResult {
  const watches = useSelector(store, (s) => s.watches);
  const loaded = useSelector(store, (s) => s.loaded);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    void refetchWatches().then((rows) => {
      if (rows.some((row) => row.avatarUrl === undefined)) {
        timer = setTimeout(() => void refetchWatches(), 4000);
      }
    });
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, []);

  return { watches, loading: !loaded, refetch: refetchWatches };
}
