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

function isFieldId(id: string): id is FieldId {
  return id in FIELD_DESCRIPTORS;
}

/** Rebuilds the field list from its joined key, so callers can pass a fresh array every render. */
function fieldsOfKey(key: string): Array<FieldId> {
  return key ? key.split(",").filter(isFieldId) : [];
}

export function useFieldCounts(
  fields: ReadonlyArray<FieldId>,
): Map<FieldId, ChoiceCounts> {
  const saves = useSaves();
  const nav = useLibraryNav() ?? ALL;
  const memberships = useFolderMemberships();
  const folders = useFolders();
  const key = fields.join(",");
  const keyedFields = useMemo(() => fieldsOfKey(key), [key]);
  return useMemo(() => {
    const result = new Map<FieldId, ChoiceCounts>(
      keyedFields.map((field) => [field, { counts: new Map(), empty: 0 }]),
    );
    if (!keyedFields.length) {
      return result;
    }
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
          : projected === null || projected === undefined || projected === ""
            ? []
            : [projected];
        if (!values.length) tally.empty++;
        for (const value of new Set(
          values.map((value) => String(value).toLowerCase()),
        )) {
          tally.counts.set(value, (tally.counts.get(value) ?? 0) + 1);
        }
      }
    }
    return result;
  }, [saves, nav, memberships, folders, keyedFields]);
}

export function useChoiceCounts(field: FieldId): ChoiceCounts {
  const counts = useFieldCounts([field]);
  return counts.get(field) ?? { counts: new Map(), empty: 0 };
}
