import { ensureSaves } from "@/features/saves/lib/ensure-saves";
import { bulkMutation } from "@/features/saves/lib/mutate";
import { openSave, saveIdFromPath } from "@/features/saves/lib/save-nav";
import { selectOnlySave } from "@/features/saves/lib/select";
import { pool } from "@/features/saves/state/pool";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import {
  primarySelectionStore,
  selection,
} from "@/features/saves/state/selection";
import { tumbleToTrash } from "@/features/saves/state/trash-tumble";
import { getAppRouter } from "@/shared/lib/app-router";
import { errorCopy } from "@/shared/lib/error-copy";
import { formatPlural } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { notifyUndoable } from "@/shared/lib/undo-toast";

function savesLabel(count: number): string {
  return formatPlural(count, { one: "Save", other: "Saves" });
}

function trashTitle(count: number): string {
  if (count === 1) return "Moved to Trash";
  return `Moved ${savesLabel(count)} to Trash`;
}

function restoredTitle(count: number): string {
  if (count === 1) return "Restored from Trash";
  return `Restored ${savesLabel(count)}`;
}

/** Favorites every target unless all of them already are, matching how mixed toggles resolve elsewhere. */
function nextFavorite(ids: readonly string[]): boolean {
  return !ids.every((id) => pool.get(id)?.favorite === true);
}

export async function toggleFavorite(ids: readonly string[]): Promise<void> {
  if (!ids.length) return;
  const favorite = nextFavorite(ids);
  try {
    const { undoId } = await bulkMutation(ids, {
      kind: "favorite",
      favorite,
    });
    const subject = ids.length === 1 ? "" : ` ${savesLabel(ids.length)}`;
    notifyUndoable({
      id: "favorite",
      title: favorite ? `Favorited${subject}` : `Unfavorited${subject}`,
      undoneTitle: favorite ? "Favorite undone" : "Unfavorite undone",
      subject: "favorite change",
      step: undoId,
    });
  } catch (error) {
    notify({
      id: "favorite-error",
      title: "Couldn't update the favorite",
      description: errorCopy(error, "Try again."),
    });
  }
}

/** Trash stays recoverable, so it runs without a confirmation and offers a scoped Undo instead. */
export async function moveSavesToTrash(ids: readonly string[]): Promise<void> {
  const targets = ids.filter((id) => !pool.get(id)?.deletedAt);
  if (!targets.length) return;
  await tumbleToTrash(targets);
  try {
    const { changed, undoId } = await bulkMutation(targets, { kind: "trash" });
    if (!changed) return;
    notifyUndoable({
      id: "trash",
      title: trashTitle(changed),
      undoneTitle: restoredTitle(changed),
      subject: "move to Trash",
      step: undoId,
    });
  } catch (error) {
    notify({
      id: "trash-error",
      title: "Couldn't move to Trash",
      description: errorCopy(error, "Try again."),
    });
  }
}

export async function moveSelectionToTrash(
  ids: readonly string[],
): Promise<void> {
  await moveSavesToTrash(ids);
  selection.clear();
}

/** Shows `next` in the same surface: the preview when one is open, otherwise the results grid. */
export async function showResult(
  next: string,
  from: string | null,
): Promise<void> {
  await ensureSaves([next]);
  if (primarySelectionStore.state.id !== from) return;
  const detail =
    saveIdFromPath(getAppRouter()?.state.location.pathname ?? "") !== null;
  selectOnlySave(next);
  if (detail) openSave(next);
  else await resultNavigation.reveal(next);
}

/** Moves to a neighbor without touching the Save, so folders, tags, notes, rating and favorite stay as they were. */
export async function skipSave(delta: 1 | -1): Promise<void> {
  const current = primarySelectionStore.state.id;
  if (!current) return;
  const next = await resultNavigation.next(current, delta);
  if (primarySelectionStore.state.id !== current) return;
  if (!next) {
    notify({
      id: "skip-end",
      title: delta > 0 ? "No more Saves" : "No earlier Saves",
    });
    return;
  }
  await showResult(next, current);
}
