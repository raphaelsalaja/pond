import { useSelector } from "@tanstack/react-store";
import type { Save } from "@/lib/types";
import { pagingStore } from "@/stores/bootstrap";
import { savesStore } from "@/stores/pool";

export function useSave(id: string | null | undefined): Save | undefined {
  return useSelector(savesStore, (s) => (id ? s.byId.get(id) : undefined));
}

export function useSaves(): ReadonlyArray<Save> {
  return useSelector(savesStore, (s) => s.sorted);
}

/** The grid hides ingesting saves until "complete"; this count lets the dock's saving pill surface that in-flight work, optionally scoped to a lowercase source. */
export function useIngestingCount(source?: string): number {
  return useSelector(savesStore, (s) => {
    let count = 0;
    for (const save of s.byId.values()) {
      if (save.status !== "ingesting") continue;
      if (source && save.source.toLowerCase() !== source) continue;
      count += 1;
    }
    return count;
  });
}

/** Summed per-save pipeline progress across ingesting saves; the selector returns a primitive so the saving pill never re-renders on unrelated pool changes. */
export function useIngestingProgressSum(): number {
  return useSelector(savesStore, (s) => {
    let sum = 0;
    for (const save of s.byId.values()) {
      if (save.status !== "ingesting") continue;
      const tasks = save.tasks ?? [];
      if (tasks.length === 0) continue;
      let done = 0;
      for (const t of tasks) if (t.status === "done") done += 1;
      sum += done / tasks.length;
    }
    return sum;
  });
}
export function useBootReady(): boolean {
  return useSelector(pagingStore, (s) => s.ready);
}

export function useSavePaging() {
  return useSelector(pagingStore, (s) => ({
    hasMore: s.hasMore,
    loading: s.loading,
    loaded: s.loaded,
    total: s.total,
  }));
}
