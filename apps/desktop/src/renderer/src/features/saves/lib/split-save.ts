import { canSplitFiles } from "@shared/save-slides";
import type { Save } from "@/features/saves/types";
import { notify } from "@/shared/lib/toast";

/** Same rule as the Split Into Saves context-menu command. */
export function saveCanSplit(save: Save): boolean {
  return (
    !save.deletedAt && save.status === "complete" && canSplitFiles(save.files)
  );
}

/** Selection when present, otherwise the primary save. Empty when none can split. */
export function splitTargetIds(
  selectedIds: readonly string[],
  primaryId: string | null,
  saveById: (id: string) => Save | undefined,
): string[] {
  const ids =
    selectedIds.length > 0 ? [...selectedIds] : primaryId ? [primaryId] : [];
  const applicable = ids.some((id) => {
    const save = saveById(id);
    return save != null && saveCanSplit(save);
  });
  return applicable ? ids : [];
}

function splitTitle(split: number, created: number): string {
  const total = split + created;
  if (split === 1) return `Split into ${total} saves`;
  return `Split ${split} saves into ${total}`;
}

export function splitIntoSaves(ids: readonly string[]): void {
  if (ids.length === 0) return;
  void window.pond.query("saves.split", { ids: [...ids] }).then((result) =>
    notify({
      id: "split-saves",
      title: result.ok
        ? splitTitle(result.split, result.created)
        : "Couldn't split",
      description: result.ok ? undefined : result.error,
    }),
  );
}
