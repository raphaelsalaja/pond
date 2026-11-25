import { useMemo } from "react";
import {
  toFolderTableRow,
  toSourceTableRow,
} from "@/features/sources/components/page/lib/helpers";
import type { SourceTableRow } from "@/features/sources/components/page/lib/helpers";
import { cardModel } from "@/features/sources/components/sync-monitor/lib/helpers";
import { useAccounts } from "@/features/sources/hooks/use-accounts";
import { useWatchedFolder } from "@/features/sources/hooks/use-watched-folder";
import { useWatches } from "@/features/sources/hooks/use-watches";
import { useSyncByAccount } from "@/features/sources/state/sync-monitor";

export function useSourceTableRows() {
  const {
    accounts,
    loading: accountsLoading,
    refetch: refetchAccounts,
  } = useAccounts();
  const {
    watches,
    loading: watchesLoading,
    refetch: refetchWatches,
  } = useWatches();
  const watchedFolder = useWatchedFolder();
  const byAccount = useSyncByAccount();

  const rows = useMemo<Array<SourceTableRow>>(() => {
    const next: Array<SourceTableRow> = [];
    for (const row of accounts) {
      next.push(
        toSourceTableRow(
          { kind: "account", row },
          cardModel(byAccount[row.id]),
        ),
      );
    }
    for (const row of watches) {
      next.push(
        toSourceTableRow({ kind: "watch", row }, cardModel(byAccount[row.id])),
      );
    }
    const folder = watchedFolder.data
      ? toFolderTableRow(watchedFolder.data)
      : null;
    if (folder) next.push(folder);
    return next;
  }, [accounts, watches, watchedFolder.data, byAccount]);

  return {
    rows,
    loaded: !accountsLoading && !watchesLoading && !watchedFolder.isPending,
    refetchAccounts,
    refetchWatches,
  };
}
