import {
  IMPORT_MEDIA_KINDS,
  type ImportScope,
  SOURCES,
  type Source,
} from "@pond/schema/db";
import { LIST_KINDS } from "@pond/schema/list-kinds";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { useEffect } from "react";
import { z } from "zod";
import {
  type SyncAccountStatus,
  syncMonitor,
} from "@/features/sources/state/sync-monitor";

export interface AccountRow {
  id: string;
  source: Source;
  handle: string | null;
  label: string | null;
  avatarUrl?: string | null;
  addedAt: string;
  sync: {
    lastSyncedAt: string | null;
    lastError: string | null;
    knownCount: number;
    syncLikes?: boolean;
    importScope?: ImportScope;
    importPending?: boolean;
  };
  connected: boolean;
  syncing: boolean;
}

const ImportScopeSchema = z
  .object({
    listKinds: z.array(z.enum(LIST_KINDS)).optional().catch(undefined),
    collections: z
      .array(z.object({ id: z.string(), name: z.string() }))
      .optional()
      .catch(undefined),
    mediaKinds: z.array(z.enum(IMPORT_MEDIA_KINDS)).optional().catch(undefined),
    since: z.string().optional().catch(undefined),
    addToFolders: z.boolean().optional().catch(undefined),
  })
  .optional()
  .catch(undefined);

const AccountsReplySchema = z
  .object({
    accounts: z
      .array(
        z.object({
          id: z.string(),
          source: z.enum(SOURCES),
          handle: z.string().nullable().catch(null),
          label: z.string().nullable().catch(null),
          avatarUrl: z.string().nullable().optional().catch(null),
          addedAt: z.string().catch(""),
          sync: z
            .object({
              lastSyncedAt: z.string().nullable().catch(null),
              lastError: z.string().nullable().catch(null),
              knownCount: z.number().catch(0),
              syncLikes: z.boolean().optional().catch(undefined),
              importScope: ImportScopeSchema,
              importPending: z.boolean().optional().catch(undefined),
            })
            .catch({ lastSyncedAt: null, lastError: null, knownCount: 0 }),
          connected: z.boolean().catch(false),
          syncing: z.boolean().catch(false),
        }),
      )
      .catch([]),
  })
  .catch({ accounts: [] });

interface AccountsState {
  accounts: AccountRow[];
  loaded: boolean;
}

const store = new Store<AccountsState>({
  accounts: [],
  loaded: false,
});

interface AccountsResult {
  accounts: AccountRow[];
  loading: boolean;
  refetch: () => Promise<AccountRow[]>;
}

export async function refetchAccounts(): Promise<AccountRow[]> {
  try {
    const rows = AccountsReplySchema.parse(
      await window.pond.query("accounts.list", {}),
    ).accounts;
    store.setState(() => ({ accounts: rows, loaded: true }));
    for (const account of rows) {
      const status: Partial<SyncAccountStatus> = {
        connected: account.connected,
        lastSyncedAt: account.sync.lastSyncedAt,
        lastError: account.sync.lastError,
      };
      if (account.syncing) status.state = "running";
      syncMonitor.seed(account.id, account.source, status);
    }
    return rows;
  } catch {
    store.setState((s) => ({ ...s, loaded: true }));
    return [];
  }
}

export function useAccounts(): AccountsResult {
  const accounts = useSelector(store, (s) => s.accounts);
  const loaded = useSelector(store, (s) => s.loaded);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    void refetchAccounts().then((rows) => {
      if (rows.some((row) => row.handle && row.avatarUrl === undefined)) {
        timer = setTimeout(() => void refetchAccounts(), 4000);
      }
    });
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  return { accounts, loading: !loaded, refetch: refetchAccounts };
}
