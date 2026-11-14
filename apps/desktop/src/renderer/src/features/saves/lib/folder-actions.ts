import {
  type SaveFolderReference,
  saveLibraryBridge,
} from "@/features/saves/lib/library-bridge";
import { errorCopy } from "@/shared/lib/error-copy";
import { formatPlural } from "@/shared/lib/format";
import { notify } from "@/shared/lib/toast";

function saveCount(count: number): string {
  return formatPlural(count, { one: "Save", other: "Saves" });
}

export function notifyUndoableFolderChange(
  id: string,
  title: string,
  onUndo?: () => void,
): void {
  notify({
    id,
    title,
    action: {
      label: "Undo",
      onClick: () => {
        void window.pond.undo().then((result) => {
          if (result.ok) {
            void saveLibraryBridge.refreshFolders();
            onUndo?.();
          } else
            notify({
              id: `${id}-undo`,
              title: "Couldn't undo folder change",
            });
        });
      },
    },
  });
}

export async function assignSavesToFolder(
  ids: readonly string[],
  folder: SaveFolderReference,
  onUndo?: () => void,
): Promise<boolean> {
  if (ids.length === 0) return false;
  try {
    await window.pond.query("folders.addSaves", {
      folderId: folder.id,
      saveIds: [...ids],
    });
    saveLibraryBridge.rememberFolderDestinations([folder.id]);
    await saveLibraryBridge.refreshFolders();
    notifyUndoableFolderChange(
      "add-saves-to-folder",
      `Added ${saveCount(ids.length)} to "${folder.name}"`,
      onUndo,
    );
    return true;
  } catch (error) {
    notify({
      id: "add-saves-to-folder",
      title: `Couldn't add ${ids.length === 1 ? "Save" : "Saves"} to folder`,
      description: errorCopy(error, "Try again."),
    });
    return false;
  }
}

export async function removeSavesFromFolder(
  ids: readonly string[],
  folder: SaveFolderReference,
): Promise<void> {
  if (ids.length === 0) return;
  try {
    await window.pond.query("folders.assign", {
      saveIds: [...ids],
      addIds: [],
      removeIds: [folder.id],
    });
    await saveLibraryBridge.refreshFolders();
    notifyUndoableFolderChange(
      "remove-saves-from-folder",
      `Removed ${saveCount(ids.length)} from "${folder.name}"`,
    );
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
