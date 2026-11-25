import type { Source } from "@pond/schema/db";
import type { SourceOverview } from "@shared/account-contracts";
import type { QueryResult } from "@shared/query-contracts";
import { useQuery } from "@tanstack/react-query";
import type { UseQueryResult } from "@tanstack/react-query";
import { useSyncByAccount } from "@/features/sources/state/sync-monitor";

export type SourceRun = QueryResult<"sync.history">["runs"][number];

const HISTORY_LIMIT = 100;

export function runFreshCount(run: SourceRun): number {
  return run.harvest?.fresh ?? 0;
}

/** Changes when a fetch starts or finishes, so history and counts reload after each run. */
function useRunRevision(id: string): string {
  const status = useSyncByAccount()[id];
  return `${status?.state ?? "idle"}:${status?.lastSyncedAt ?? ""}`;
}

export function useSourceHistory(
  source: Source,
  id: string,
): UseQueryResult<Array<SourceRun>> {
  const revision = useRunRevision(id);
  return useQuery({
    queryKey: ["source-history", id, revision],
    queryFn: async (): Promise<Array<SourceRun>> =>
      (
        await window.pond.query("sync.history", {
          source,
          accountId: id,
          limit: HISTORY_LIMIT,
        })
      ).runs,
    placeholderData: (previous) => previous,
  });
}

export function useSourceOverview(id: string) {
  const revision = useRunRevision(id);
  return useQuery({
    queryKey: ["source-overview", id, revision],
    queryFn: (): Promise<SourceOverview> =>
      window.pond.query("sources.overview", { id }),
    placeholderData: (previous) => previous,
  });
}
