import {
  IconArchive,
  IconArchiveExport,
  IconBulletList,
  IconCanvas,
  IconCopy,
  IconEye,
  IconFaceSmile,
  IconFileExport,
  IconFolderBolt,
  IconFolderDots,
  IconFolderImport,
  IconFolderPen,
  IconFolderPlus,
  IconFolderSend,
  IconFolders,
  IconFolderTree,
  IconFolderXmark,
  IconGridPlus,
  IconLink2,
  IconRename,
  IconTableDownload,
} from "@pond/icons";
import { EMPTY_QUERY } from "@pond/schema/filters/types";
import { Dialog, type MenuItemSpec } from "@pond/ui";
import type { ReactElement } from "react";
import {
  addFolderSavesToCanvas,
  canvases,
  createCanvasFromFolder,
} from "@/features/canvas";
import { descendantFolderIds } from "@/features/library/components/folder-sidebar/tree";
import { exportSelectionCsv, exportSelectionFiles } from "@/features/saves";
import { SpecContextMenu } from "@/shared/components/spec-context-menu";
import { shortcutGlyphs } from "@/shared/lib/shortcuts";
import { emitFeedback } from "@/shared/lib/sounds";
import { notify } from "@/shared/lib/toast";

export interface FolderMenuActions {
  hasChildren: boolean;
  sameLevelHasChildren: boolean;
  includeSubfolders: boolean;
  creating: boolean;
  onNewFolder: () => void;
  onNewSubfolder: () => void;
  moveItems: MenuItemSpec[];
  onRename: () => void;
  onBatchRename?: () => void;
  onAutoTag: () => void;
  onToggleFolder: () => void;
  onToggleSameLevel: () => void;
  onToggleAll: () => void;
  onDuplicate: () => void;
  onExportFiles: () => void;
  onExportCsv: () => void;
  onExportEaglePackage: () => void;
  onExportPackage: () => void;
  onCopyToLibrary: () => void;
  onCreateCanvas: () => void;
  canvasItems: MenuItemSpec[];
  onCopyLink?: () => void;
  onToggleSubfolders: (next: boolean) => void;
  onCustomize: () => void;
  onRemove: () => void;
}

export function buildFolderMenuItems(a: FolderMenuActions): MenuItemSpec[] {
  return [
    {
      label: "New Folder",
      icon: <IconFolderPlus />,
      shortcut: shortcutGlyphs("library.new-folder"),
      disabled: a.creating,
      onClick: a.onNewFolder,
    },
    {
      label: "New Subfolder",
      icon: <IconFolders />,
      disabled: a.creating,
      onClick: a.onNewSubfolder,
    },
    {
      type: "submenu",
      label: "Move To",
      icon: <IconFolderSend />,
      items: a.moveItems,
    },
    { type: "separator" },
    {
      label: "Rename",
      icon: <IconFolderPen />,
      onClick: a.onRename,
    },
    {
      label: "Batch Rename Folders",
      icon: <IconRename />,
      onClick: a.onBatchRename,
    },
    {
      label: "Set Auto-Tag",
      icon: <IconFolderBolt />,
      onClick: a.onAutoTag,
    },
    { type: "separator" },
    {
      label: "Expand/Collapse Folder",
      icon: <IconBulletList />,
      disabled: !a.hasChildren,
      onClick: a.onToggleFolder,
    },
    {
      label: "Expand/Collapse Same Level Folders",
      icon: <IconFolderDots />,
      disabled: !a.sameLevelHasChildren,
      onClick: a.onToggleSameLevel,
    },
    {
      label: "Expand/Collapse All Folders",
      icon: <IconFolderTree />,
      onClick: a.onToggleAll,
    },
    { type: "separator" },
    {
      label: "Duplicate",
      icon: <IconCopy />,
      disabled: a.creating,
      onClick: a.onDuplicate,
    },
    { type: "separator" },
    {
      label: "Create Canvas from Folder",
      icon: <IconCanvas />,
      keywords: "canvas board",
      onClick: a.onCreateCanvas,
    },
    {
      type: "submenu",
      label: "Add Folder Saves to Canvas",
      icon: <IconGridPlus />,
      keywords: "canvas board",
      disabled: !a.canvasItems.length,
      items: a.canvasItems,
    },
    { type: "separator" },
    {
      type: "submenu",
      label: "Export",
      icon: <IconFileExport />,
      items: [
        {
          label: "Export Files",
          icon: <IconFileExport />,
          keywords: "files",
          onClick: a.onExportFiles,
        },
        {
          label: "Export to CSV",
          icon: <IconTableDownload />,
          keywords: "csv",
          onClick: a.onExportCsv,
        },
        {
          label: "Export Eagle Package",
          icon: <IconArchive />,
          keywords: "eagle package",
          onClick: a.onExportEaglePackage,
        },
        {
          label: "Export Pond Package",
          icon: <IconArchiveExport />,
          keywords: "package",
          onClick: a.onExportPackage,
        },
      ],
    },
    {
      label: "Add to Other Library",
      icon: <IconFolderImport />,
      onClick: a.onCopyToLibrary,
    },
    {
      label: "Copy Folder Link",
      icon: <IconLink2 />,
      onClick: a.onCopyLink,
      disabled: !a.onCopyLink,
    },
    { type: "separator" },
    {
      type: "checkbox",
      label: "Show Subfolder Content",
      icon: <IconEye />,
      indicator: "check",
      checked: a.includeSubfolders,
      onCheckedChange: a.onToggleSubfolders,
    },
    { type: "separator" },
    {
      label: "Customize Folder",
      icon: <IconFaceSmile />,
      onClick: a.onCustomize,
    },
    { type: "separator" },
    {
      label: "Remove Folder",
      icon: <IconFolderXmark />,
      variant: "destructive",
      onClick: a.onRemove,
    },
  ];
}

export async function duplicateFolder(folder: {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
}): Promise<string> {
  const copy = await window.pond.query("folders.create", {
    name: `${folder.name} Copy`,
    parentId: folder.parentId,
    color: folder.color,
  });
  const ids = await folderSaveIds([folder.id]);
  if (ids.length) {
    await window.pond.query("folders.addSaves", {
      folderId: copy.id,
      saveIds: ids,
    });
  }
  return copy.id;
}

export function folderIdsForExport(
  folderId: string,
  folders: ReadonlyArray<{ id: string; parentId: string | null }>,
  includeSubfolders: boolean,
): string[] {
  return includeSubfolders
    ? descendantFolderIds(folderId, folders)
    : [folderId];
}

async function folderSaveIds(folderIds: string[]): Promise<string[]> {
  const result = await window.pond.query("saves.queryIds", {
    query: EMPTY_QUERY,
    scope: { folderIds },
  });
  return result.ids;
}

async function withFolderSaves(
  folderIds: string[],
  run: (ids: string[]) => Promise<void>,
): Promise<void> {
  const ids = await folderSaveIds(folderIds);
  if (!ids.length) {
    notify({
      id: "folder-saves",
      title: "This folder has no Saves.",
    });
    return;
  }
  await run(ids);
}

export async function exportFolderFiles(folderIds: string[]): Promise<void> {
  await withFolderSaves(folderIds, async (ids) => {
    const result = await exportSelectionFiles(ids);
    if (!result.ok) notify({ id: "folder-export", title: result.message });
  });
}

export async function exportFolderCsv(folderIds: string[]): Promise<void> {
  await withFolderSaves(folderIds, async (ids) => {
    const result = await exportSelectionCsv(ids);
    if (!result.ok) notify({ id: "folder-export", title: result.message });
  });
}

export async function exportFolderPackage(folderIds: string[]): Promise<void> {
  await withFolderSaves(folderIds, async (ids) => {
    const result = await window.pond.query("saves.exportPackage", { ids });
    if (!result.ok && result.reason !== "cancelled")
      notify({
        id: "folder-export",
        title: result.error || "Couldn't export package.",
      });
    else if (result.ok)
      notify({ id: "folder-export", title: "Pond package exported" });
  });
}

export async function exportFolderEaglePackage(
  folderIds: string[],
): Promise<void> {
  await withFolderSaves(folderIds, async (ids) => {
    const result = await window.pond.query("saves.exportEaglePackage", { ids });
    if (!result.ok && result.reason !== "cancelled")
      notify({
        id: "folder-export",
        title: result.error || "Couldn't export Eagle package.",
      });
    else if (result.ok)
      notify({ id: "folder-export", title: "Eagle package exported" });
  });
}

export async function createCanvasFromFolderSaves(
  name: string,
  folderIds: string[],
): Promise<void> {
  await withFolderSaves(folderIds, (ids) => createCanvasFromFolder(name, ids));
}

export function buildFolderCanvasItems(folderIds: string[]): MenuItemSpec[] {
  return canvases.snapshot().map((canvas) => ({
    label: canvas.name,
    icon: <IconCanvas />,
    onClick: () =>
      void withFolderSaves(folderIds, (ids) =>
        addFolderSavesToCanvas(canvas.id, ids),
      ),
  }));
}

export async function copyFolderToLibrary(folderIds: string[]): Promise<void> {
  await withFolderSaves(folderIds, async (ids) => {
    try {
      const result = await window.pond.query("saves.copyToLibrary", { ids });
      if (result.ok)
        notify({
          id: "folder-copy",
          title: "Saves copied to library",
          description: `${result.imported ?? 0} copied, ${result.skipped ?? 0} already in this library.`,
        });
      else if (result.reason !== "cancelled")
        notify({
          id: "folder-copy",
          title: result.error || "Couldn't copy Saves.",
        });
    } catch {
      notify({ id: "folder-copy", title: "Couldn't copy Saves." });
    }
  });
}

export function confirmRemoveFolder(input: {
  id: string;
  name: string;
  onRemoved: () => void | Promise<void>;
}): void {
  Dialog.confirm({
    title: `Remove "${input.name}"`,
    description:
      "Saves stay in the Library and move to Uncategorized unless you select the option below.",
    confirmLabel: "Remove",
    confirmVariant: "destructive",
    checkbox: {
      label: "Move Saves in this folder and its subfolders to Trash",
    },
    onConfirm: async ({ checked }) => {
      await window.pond.query("folders.delete", {
        id: input.id,
        trashContainedSaves: checked,
      });
      emitFeedback("folderDeletion");
      await input.onRemoved();
    },
  });
}

interface FolderContextMenuProps {
  buildItems: () => MenuItemSpec[];
  children: ReactElement;
}

export function FolderContextMenu({
  buildItems,
  children,
}: FolderContextMenuProps) {
  return (
    <SpecContextMenu
      search
      searchLabel="Search folder operations"
      minWidth="280px"
      buildItems={buildItems}
    >
      {children}
    </SpecContextMenu>
  );
}
