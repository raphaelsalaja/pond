import { useState } from "react";
import type { Save } from "@/features/saves/types";

const NO_DEPARTED_IDS: ReadonlyArray<string> = [];

export interface RetainedTagPickerSaves {
  rows: ReadonlyArray<Save>;
  /** Saves kept on screen only while the tag picker still has them. */
  departedIds: ReadonlyArray<string>;
  previous: ReadonlyArray<Save>;
}

/**
 * A filtered page drops a Save as soon as a tag makes it miss the view. The open
 * picker is positioned on that card, so the row stays in its previous place until
 * the picker closes.
 */
export function retainTagPickerSaves(
  current: ReadonlyArray<Save>,
  heldIds: ReadonlyArray<string>,
  previous: ReadonlyArray<Save>,
): RetainedTagPickerSaves {
  if (heldIds.length === 0) {
    return { rows: current, departedIds: NO_DEPARTED_IDS, previous: current };
  }
  const currentIds = new Set(current.map((save) => save.id));
  const hold = new Set(heldIds);
  const departed = previous.filter(
    (save) => hold.has(save.id) && !currentIds.has(save.id),
  );
  if (departed.length === 0) {
    return { rows: current, departedIds: NO_DEPARTED_IDS, previous: current };
  }
  const previousIndex = new Map(
    previous.map((save, index) => [save.id, index]),
  );
  const rows = current.slice();
  const ordered = [...departed].sort(
    (a, b) => (previousIndex.get(a.id) ?? 0) - (previousIndex.get(b.id) ?? 0),
  );
  for (const save of ordered) {
    const at = previousIndex.get(save.id) ?? 0;
    let insertAt = rows.length;
    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      if (!row) {
        continue;
      }
      const prior = previousIndex.get(row.id);
      if (prior !== undefined && prior > at) {
        insertAt = index;
        break;
      }
    }
    rows.splice(insertAt, 0, save);
  }
  const departedIds = ordered.map((save) => save.id);
  return { rows, departedIds, previous: rows };
}

export function useRetainedTagPickerSaves(
  current: ReadonlyArray<Save>,
  heldIds: ReadonlyArray<string>,
): RetainedTagPickerSaves {
  const [cached, setCached] = useState<{
    current: ReadonlyArray<Save>;
    heldIds: ReadonlyArray<string>;
    result: RetainedTagPickerSaves;
  } | null>(null);
  if (cached && cached.current === current && cached.heldIds === heldIds) {
    return cached.result;
  }
  const result = retainTagPickerSaves(
    current,
    heldIds,
    cached?.result.previous ?? [],
  );
  setCached({ current, heldIds, result });
  return result;
}
