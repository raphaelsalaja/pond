import { useSelector } from "@tanstack/react-store";
import { useEffect, useMemo } from "react";
import {
  ensureSaves,
  savesStore,
  useRetainedSaves,
} from "@/features/saves/pool";
import type { Save } from "@/features/saves/types";

function sameItems(
  a: ReadonlyArray<Save | undefined>,
  b: ReadonlyArray<Save | undefined>,
): boolean {
  return a.length === b.length && a.every((save, i) => save === b[i]);
}

/** Live, untrashed saves for these ids; re-renders only when one of them changes. */
export function useSavesById(
  ids: ReadonlyArray<string>,
  deleted = false,
): ReadonlyArray<Save> {
  const key = ids.join("\n");
  useRetainedSaves(ids);
  useEffect(() => {
    if (key) {
      void ensureSaves(key.split("\n")).catch(() => {});
    }
  }, [key]);
  const found = useSelector(
    savesStore,
    (state) => ids.map((id) => state.byId.get(id)),
    { compare: sameItems },
  );
  return useMemo(
    () =>
      found.filter(
        (save): save is Save =>
          save !== undefined && Boolean(save.deletedAt) === deleted,
      ),
    [found, deleted],
  );
}
