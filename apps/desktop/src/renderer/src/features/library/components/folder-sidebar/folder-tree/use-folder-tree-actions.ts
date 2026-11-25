import type { Folder } from "@pond/schema/db";
import { Dialog } from "@pond/ui";
import type { MenuItemSpec } from "@pond/ui";
import { useState } from "react";
import { buildMoveFolderItems } from "@/features/library/lib/move-folders-menu";
import { errorCopy } from "@/shared/lib/error-copy";
import { notify } from "@/shared/lib/toast";
import { saveFolderPresentation } from "../../../state/folder-presentation";
import { folders } from "../../../state/folders";
import { openOrganizationRenameDialog } from "../../../state/organization-rename-dialog";
import {
  exportFolderCsv,
  exportFolderFiles,
  folderIdsForExport,
} from "../../folder-context-menu";
import type { FolderTool } from "../../folder-tools";

interface FolderTreeActionsOptions {
  folderRows: Array<Folder>;
  includeSubfolders: boolean;
  onCreateStart: () => void;
}

export function useFolderTreeActions({
  folderRows,
  includeSubfolders,
  onCreateStart,
}: FolderTreeActionsOptions) {
  const [folderTool, setFolderTool] = useState<FolderTool | null>(null);
  const [customizingFolderId, setCustomizingFolderId] = useState<string | null>(
    null,
  );
  const [creatingFolder, setCreatingFolder] = useState(false);

  async function createFolder(parentId?: string): Promise<void> {
    if (creatingFolder) return;
    setCreatingFolder(true);
    onCreateStart();
    try {
      const folder = await window.pond.query("folders.create", {
        name: "Untitled",
        parentId,
      });
      await folders.refresh();
      folders.startEditing(folder.id);
    } catch (error) {
      notify({
        id: "create-folder",
        title: "Couldn't create folder",
        description: errorCopy(error, "Try again."),
      });
    } finally {
      setCreatingFolder(false);
    }
  }

  function exportIdsFor(selected: Array<string>): Array<string> {
    return [
      ...new Set(
        selected.flatMap((id) =>
          folderIdsForExport(id, folderRows, includeSubfolders),
        ),
      ),
    ];
  }

  function selectionItems(selected: Array<string>): Array<MenuItemSpec> {
    return [
      {
        type: "submenu",
        label: `Move ${selected.length} Folders To`,
        items: buildMoveFolderItems(selected),
      },
      {
        label: "Batch Rename Folders",
        onClick: () => openOrganizationRenameDialog("folders", selected),
      },
      {
        label: "Add to Quick Access",
        onClick: () =>
          void Promise.all(
            selected.map((id) =>
              saveFolderPresentation(id, {
                quickAccess: true,
              }),
            ),
          ),
      },
      {
        label: "Remove Folders",
        variant: "destructive",
        onClick: () =>
          Dialog.confirm({
            title: `Remove ${selected.length} Folders`,
            description:
              "The folders and their subfolders are removed. Your Saves stay in the Library.",
            confirmLabel: "Remove",
            confirmVariant: "destructive",
            onConfirm: async () => {
              const roots = selected.filter(
                (id) =>
                  !selected.some(
                    (other) =>
                      other !== id &&
                      folderIdsForExport(other, folderRows, true).includes(id),
                  ),
              );
              for (const id of roots) {
                await window.pond.query("folders.delete", {
                  id,
                  trashContainedSaves: false,
                });
              }
              await folders.refresh();
            },
          }),
      },
      {
        label: "Export Files",
        onClick: () => void exportFolderFiles(exportIdsFor(selected)),
      },
      {
        label: "Export to CSV",
        onClick: () => void exportFolderCsv(exportIdsFor(selected)),
      },
    ];
  }

  return {
    folderTool,
    setFolderTool,
    customizingFolderId,
    setCustomizingFolderId,
    creatingFolder,
    createFolder,
    selectionItems,
  };
}
