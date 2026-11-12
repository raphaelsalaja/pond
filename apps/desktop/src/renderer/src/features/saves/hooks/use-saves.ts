import { shallow, useSelector } from "@tanstack/react-store";
import { useEffect } from "react";
import { pagingStore } from "@/features/saves/state/bootstrap";
import { protectSaves, savesStore } from "@/features/saves/state/pool";
import type { Save } from "@/features/saves/types";

export function useSave(id: string | null | undefined): Save | undefined {
  useEffect(() => (id ? protectSaves(() => [id]) : undefined), [id]);
  return useSelector(savesStore, (s) => (id ? s.byId.get(id) : undefined));
}

/** Keeps these rows in the pool while mounted, for readers that select them without `useSave`. */
export function useRetainedSaves(ids: readonly string[]): void {
  const key = ids.join("\n");
  useEffect(() => {
    if (!key) return;
    const held = key.split("\n");
    return protectSaves(() => held);
  }, [key]);
}

export function useSaves(): ReadonlyArray<Save> {
  return useSelector(savesStore, (s) => s.sorted);
}

export function useBootReady(): boolean {
  return useSelector(pagingStore, (s) => s.ready);
}

export function useSavePaging() {
  return useSelector(
    pagingStore,
    (s) => ({
      hasMore: s.hasMore,
      loading: s.loading,
      loaded: s.loaded,
      total: s.total,
    }),
    { compare: shallow },
  );
}
