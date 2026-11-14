import {
  type SaveFolderReference,
  saveLibraryBridge,
} from "@/features/saves/lib/library-bridge";
import { errorCopy } from "@/shared/lib/error-copy";
import { formatPlural } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";
import { notifyUndoable } from "@/shared/lib/undo-toast";

function saveCount(count: number): string {
  return formatPlural(count, { one: "Save", other: "Saves" });
}

export interface FolderMembershipChange {
  kind: "add" | "remove";
  saveCount: number;
  folders: readonly Pick<SaveFolderReference, "name">[];
}

export function folderChangeTitle(change: FolderMembershipChange): string {
  const [only] = change.folders;
  const target =
    change.folders.length === 1 && only
      ? `"${only.name}"`
      : formatPlural(change.folders.length, {
          one: "Folder",
          other: "Folders",
        });
  const subject =
    change.saveCount === 1 ? "" : ` ${saveCount(change.saveCount)}`;
  return change.kind === "add"
    ? `Added${subject} to ${target}`
    : `Removed${subject} from ${target}`;
}

export function notifyUndoableFolderChange(
  id: string,
  title: string,
  undoId: string | null,
  undoneTitle = "Folder change undone",
): void {
  notifyUndoable({
    id,
    title,
    undoneTitle,
    subject: "folder change",
    step: undoId,
    onChange: () => saveLibraryBridge.refreshFolders(),
  });
}

export function notifyFolderMembershipChange(
  change: FolderMembershipChange,
  undoId: string | null,
): void {
  notifyUndoableFolderChange(
    "folder-membership",
    folderChangeTitle(change),
    undoId,
    change.kind === "add" ? "Assignment undone" : "Removal undone",
  );
}

/** Applies one immediate folder delta to the Saves and confirms it with a scoped Undo. */
export async function changeSaveFolders(input: {
  saveIds: readonly string[];
  add: readonly SaveFolderReference[];
  remove: readonly SaveFolderReference[];
}): Promise<void> {
  if (input.saveIds.length === 0) return;
  const addIds = input.add.map((folder) => folder.id);
  const result = await window.pond.query("folders.assign", {
    saveIds: [...input.saveIds],
    addIds,
    removeIds: input.remove.map((folder) => folder.id),
  });
  if (addIds.length) saveLibraryBridge.rememberFolderDestinations(addIds);
  await saveLibraryBridge.refreshFolders();
  const adding = input.add.length > 0;
  notifyFolderMembershipChange(
    {
      kind: adding ? "add" : "remove",
      saveCount: input.saveIds.length,
      folders: adding ? input.add : input.remove,
    },
    result.ok ? result.undoId : null,
  );
}

export async function assignSavesToFolder(
  ids: readonly string[],
  folder: SaveFolderReference,
): Promise<void> {
  if (ids.length === 0) return;
  try {
    const result = await window.pond.query("folders.addSaves", {
      folderId: folder.id,
      saveIds: [...ids],
    });
    saveLibraryBridge.rememberFolderDestinations([folder.id]);
    await saveLibraryBridge.refreshFolders();
    notifyFolderMembershipChange(
      { kind: "add", saveCount: ids.length, folders: [folder] },
      result.ok ? result.undoId : null,
    );
  } catch (error) {
    notify({
      id: "add-saves-to-folder",
      title: `Couldn't add ${ids.length === 1 ? "Save" : "Saves"} to folder`,
      description: errorCopy(error, "Try again."),
    });
  }
}

export async function removeSavesFromFolder(
  ids: readonly string[],
  folder: SaveFolderReference,
): Promise<void> {
  if (ids.length === 0) return;
  try {
    await changeSaveFolders({ saveIds: ids, add: [], remove: [folder] });
  } catch (error) {
    notify({
      id: "remove-saves-from-folder",
      title: `Couldn't remove ${ids.length === 1 ? "Save" : "Saves"} from folder`,
      description: errorCopy(error, "Try again."),
    });
  }
}

export async function addSavesToLastUsedFolder(
  ids: readonly string[],
): Promise<void> {
  const folderId = saveLibraryBridge.lastUsedFolderId();
  const folder = folderId
    ? saveLibraryBridge
        .foldersSnapshot()
        .find((candidate) => candidate.id === folderId)
    : undefined;
  if (!folder) {
    notify({ id: "last-used-folder", title: "No recently used folder" });
    return;
  }
  await assignSavesToFolder(ids, folder);
}
