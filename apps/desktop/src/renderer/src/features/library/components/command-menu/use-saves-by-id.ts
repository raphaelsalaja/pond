import { useSelector } from "@tanstack/react-store";
import { useEffect, useMemo } from "react";
import { ensureSaves, savesStore } from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";

function sameItems(
  a: readonly (Save | undefined)[],
  b: readonly (Save | undefined)[],
): boolean {
  return a.length === b.length && a.every((save, i) => save === b[i]);
}

/** Live, untrashed saves for these ids; re-renders only when one of them changes. */
export function useSavesById(ids: readonly string[]): readonly Save[] {
  const key = ids.join("\n");
  useEffect(() => {
    if (key) void ensureSaves(key.split("\n")).catch(() => {});
  }, [key]);
  const found = useSelector(
    savesStore,
    (state) => ids.map((id) => state.byId.get(id)),
    { compare: sameItems },
  );
  return useMemo(
    () =>
      found.filter(
        (save): save is Save => save !== undefined && !save.deletedAt,
      ),
    [found],
  );
}
