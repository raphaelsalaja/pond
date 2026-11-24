import { FIELD_DESCRIPTORS } from "@pond/schema/filters/fields";
import type { FieldId } from "@pond/schema/filters/types";
import { useMemo } from "react";
import {
  useFolderMemberships,
  useFolders,
} from "@/features/library/state/folders";
import { useLibraryNav } from "@/features/library/state/library-chrome";
import { applyNavFilter } from "@/features/saves";
import { useSaves } from "@/features/saves/pool";
import type { LibraryNav } from "@/shared/lib/library-nav";

const ALL: LibraryNav = { kind: "all" };

export interface ChoiceCounts {
  counts: Map<string, number>;
  empty: number;
}

export function useFieldCounts(
  fields: readonly FieldId[],
): Map<FieldId, ChoiceCounts> {
  const saves = useSaves();
  const nav = useLibraryNav() ?? ALL;
  const memberships = useFolderMemberships();
  const folders = useFolders();
  const key = fields.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: `key` stands in for `fields`, which callers rebuild every render.
  return useMemo(() => {
    const result = new Map<FieldId, ChoiceCounts>(
      fields.map((field) => [field, { counts: new Map(), empty: 0 }]),
    );
    if (!fields.length) return result;
    const scoped = applyNavFilter(
      saves.filter((save) =>
        nav.kind === "trash" ? !!save.deletedAt : !save.deletedAt,
      ),
      nav,
      memberships,
      folders,
    );
    for (const save of scoped) {
      const record = { ...save, folderIds: memberships[save.id] ?? [] };
      for (const [field, tally] of result) {
        const projected = FIELD_DESCRIPTORS[field].project(record);
        const values = Array.isArray(projected)
          ? projected
          : projected == null || projected === ""
            ? []
            : [projected];
        if (!values.length) tally.empty++;
        for (const value of new Set(
          values.map((value) => String(value).toLowerCase()),
        ))
          tally.counts.set(value, (tally.counts.get(value) ?? 0) + 1);
      }
    }
    return result;
  }, [saves, nav, memberships, folders, key]);
}

export function useChoiceCounts(field: FieldId): ChoiceCounts {
  const counts = useFieldCounts([field]);
  return counts.get(field) ?? { counts: new Map(), empty: 0 };
}
