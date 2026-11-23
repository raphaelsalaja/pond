import { type QueryClient, useQuery } from "@tanstack/react-query";

const STORAGE_SNAPSHOT_KEY = ["storage-snapshot"] as const;

/** Every Save-attributed query shares this prefix, so one invalidation refreshes them all. */
export const STORAGE_INSIGHTS_KEY = ["storage-insights"] as const;

export function useStorageSnapshot() {
  return useQuery({
    queryKey: STORAGE_SNAPSHOT_KEY,
    queryFn: () => window.pond.query("storage.snapshot", {}),
    refetchInterval: 60_000,
  });
}

export function refreshStorage(client: QueryClient): Promise<unknown> {
  return Promise.all([
    client.invalidateQueries({ queryKey: STORAGE_SNAPSHOT_KEY }),
    client.invalidateQueries({ queryKey: STORAGE_INSIGHTS_KEY }),
  ]);
}
