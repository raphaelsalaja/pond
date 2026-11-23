import { slideFiles } from "@shared/save-slides";
import { selectOnlySave } from "@/features/saves/lib/select";
import type { Save } from "@/features/saves/types";
import { errorCopy } from "@/shared/lib/error-copy";
import { notify } from "@/shared/lib/toast";
import { notifyUndoable } from "@/shared/lib/undo-toast";

/** Same rule the main process checks before grouping. */
export function saveCanGroup(save: Save): boolean {
  return (
    !save.deletedAt &&
    save.status === "complete" &&
    slideFiles(save.files).length > 0
  );
}

/** Saves load lazily, so a selection that isn't fully loaded still offers Group and the main process decides. */
export function canGroupSelection(
  saves: readonly Save[],
  count: number,
): boolean {
  return count > 1 && saves.every(saveCanGroup);
}

export async function groupSaves(ids: readonly string[]): Promise<void> {
  if (ids.length < 2) return;
  try {
    const result = await window.pond.query("saves.group", { ids: [...ids] });
    if (!result.ok) {
      notify({
        id: "group-saves-error",
        title: "Couldn't group these Saves",
        description: result.error,
      });
      return;
    }
    selectOnlySave(result.id);
    notifyUndoable({
      id: "group-saves",
      title: `Grouped ${result.grouped} Saves`,
      undoneTitle: "Group undone",
      subject: "group",
      step: result.undoId,
    });
  } catch (error) {
    notify({
      id: "group-saves-error",
      title: "Couldn't group these Saves",
      description: errorCopy(error, "Try again."),
    });
  }
}
