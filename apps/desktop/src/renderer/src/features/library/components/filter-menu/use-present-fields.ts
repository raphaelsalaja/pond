import { FIELD_DESCRIPTORS } from "@pond/schema/filters/fields";
import { FIELD_IDS } from "@pond/schema/filters/meta";
import type { FieldId } from "@pond/schema/filters/types";
import { useEffect, useState } from "react";
import { useSavePaging, useSaves } from "@/features/saves/pool";
import { DATA_GATED_FIELDS } from "./options";

type FieldValue = ReturnType<(typeof FIELD_DESCRIPTORS)[FieldId]["project"]>;
const SAVES_PER_CHUNK = 100;

function hasValue(value: FieldValue): boolean {
  if (Array.isArray(value)) return value.length > 0;
  return value != null && value !== "" && value !== false;
}

/** Null until the whole library is in memory, so a half-loaded pool never hides a field. */
export function usePresentFields(
  enabled: boolean,
): ReadonlySet<FieldId> | null {
  const saves = useSaves();
  const { hasMore } = useSavePaging();
  const [result, setResult] = useState<{
    saves: typeof saves;
    present: ReadonlySet<FieldId>;
  } | null>(null);
  useEffect(() => {
    if (!enabled || hasMore || result?.saves === saves) return;
    let cancelled = false;
    let timer = 0;
    let index = 0;
    const probes = new Set(DATA_GATED_FIELDS.values());
    const found = new Set<FieldId>();
    const scanChunk = () => {
      const end = Math.min(index + SAVES_PER_CHUNK, saves.length);
      for (; index < end && found.size < probes.size; index += 1) {
        const save = saves[index];
        if (!save) continue;
        const record = { ...save, folderIds: [] };
        for (const probe of probes) {
          if (
            !found.has(probe) &&
            hasValue(FIELD_DESCRIPTORS[probe].project(record))
          ) {
            found.add(probe);
          }
        }
      }
      if (index < saves.length && found.size < probes.size) {
        timer = window.setTimeout(scanChunk, 0);
        return;
      }
      const next = new Set<FieldId>(
        FIELD_IDS.filter((field) => !DATA_GATED_FIELDS.has(field)),
      );
      for (const [field, probe] of DATA_GATED_FIELDS)
        if (found.has(probe)) next.add(field);
      if (!cancelled) setResult({ saves, present: next });
    };
    timer = window.setTimeout(scanChunk, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [enabled, hasMore, result, saves]);
  return enabled && !hasMore && result?.saves === saves ? result.present : null;
}
