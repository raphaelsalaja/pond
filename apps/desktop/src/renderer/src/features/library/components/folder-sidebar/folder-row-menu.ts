import {
  IconArrowDown,
  IconArrowUp,
  IconCalendarDate,
  IconCalendarPlus,
  IconDice,
  IconMediaLibrary,
  IconPalette,
  IconQuickAccess,
  IconSortAlphaAscending,
  IconSortArrows,
} from "@pond/icons";
import type { Folder } from "@pond/schema/db";
import { createElement } from "react";
import {
  buildFolderCanvasItems,
  buildFolderMenuItems,
  confirmRemoveFolder,
  copyFolderToLibrary,
  createCanvasFromFolderSaves,
  duplicateFolder,
  exportFolderCsv,
  exportFolderEaglePackage,
  exportFolderFiles,
  exportFolderPackage,
} from "@/features/library/components/folder-context-menu";
import type { FolderTool } from "@/features/library/components/folder-tools";
import { copyFolderLink } from "@/features/library/lib/copy-links";
import {
  folderColorMenuItems,
  folderIconMenuItems,
} from "@/features/library/lib/folder-appearance-menu";
import { buildMoveFolderItems } from "@/features/library/lib/move-folders-menu";
import { saveFolderPresentation } from "@/features/library/state/folder-presentation";
import { openFolderTemplateDialog } from "@/features/library/state/folder-template-dialog";
import { folders } from "@/features/library/state/folders";
import { getLibraryNav } from "@/features/library/state/library-chrome";
import { openOrganizationRenameDialog } from "@/features/library/state/organization-rename-dialog";
import {
  setIncludeSubfolders,
  setSort,
} from "@/features/library/state/view-store";
import { errorCopy } from "@/shared/lib/error-copy";
import type { FolderIconId } from "@/shared/lib/folder-icons";
import { notify } from "@/shared/lib/toast";
import { selectLibraryNav } from "./navigation";

interface FolderRowMenuInput {
  collapsed: boolean;
  creating: boolean;
  exportIds: Array<string>;
  folder: Folder;
  folderIcon?: FolderIconId;
  folderSortDir: "asc" | "desc";
  folderSortKey: string;
  hasChildren: boolean;
  includeSubfolders: boolean;
  quickAccess?: boolean;
  sameLevelHasChildren: boolean;
  viewing: boolean;
  quickAccessFolderIds: Array<string>;
  onCreateFolder: (parentId?: string) => void;
  onCustomize: () => void;
  onOpenTool: (tool: FolderTool) => void;
  onStartEditing: (id: string) => void;
  onToggleAll: () => void;
  onToggleFolder: () => void;
  onToggleSameLevel: (expanded: boolean) => void;
}

async function moveQuickAccess(
  folderId: string,
  folderIds: Array<string>,
  offset: -1 | 1,
): Promise<void> {
  const current = folderIds.indexOf(folderId);
  const target = current + offset;
  if (current < 0 || target < 0 || target >= folderIds.length) return;
  const ordered = [...folderIds];
  const [moved] = ordered.splice(current, 1);
  if (!moved) return;
  ordered.splice(target, 0, moved);
  await Promise.all(
    ordered.map((id, quickAccessOrder) =>
      saveFolderPresentation(id, { quickAccessOrder }),
    ),
  );
}

export function buildQuickAccessFolderMenuItems(input: {
  folder: Folder;
  folderIds: Array<string>;
  onOpen: () => void;
}) {
  const index = input.folderIds.indexOf(input.folder.id);
  return [
    { label: "Open Folder", onClick: input.onOpen },
    {
      label: "Copy Folder Link",
      onClick: () => copyFolderLink(input.folder.id),
    },
    {
      label: "Remove from Quick Access",
      onClick: () =>
        void saveFolderPresentation(input.folder.id, {
          quickAccess: false,
          quickAccessOrder: undefined,
        }),
    },
    { type: "separator" as const },
    {
      label: "Move Up",
      disabled: index <= 0,
      onClick: () => void moveQuickAccess(input.folder.id, input.folderIds, -1),
    },
    {
      label: "Move Down",
      disabled: index < 0 || index >= input.folderIds.length - 1,
      onClick: () => void moveQuickAccess(input.folder.id, input.folderIds, 1),
    },
  ];
}

export function buildFolderRowMenuItems(input: FolderRowMenuInput) {
  const { folder } = input;
  const items = buildFolderMenuItems({
    hasChildren: input.hasChildren,
    sameLevelHasChildren: input.sameLevelHasChildren,
    includeSubfolders: input.includeSubfolders,
    creating: input.creating,
    onNewFolder: () => input.onCreateFolder(folder.parentId ?? undefined),
    onNewSubfolder: () => input.onCreateFolder(folder.id),
    onNewSubfolderFromTemplate: () =>
      openFolderTemplateDialog({ mode: "apply", parentId: folder.id }),
    moveItems: buildMoveFolderItems([folder.id]),
    onRename: () => input.onStartEditing(folder.id),
    onBatchRename: () => openOrganizationRenameDialog("folders", folder.id),
    onAutoTag: () =>
      input.onOpenTool({ kind: "tags", id: folder.id, name: folder.name }),
    onToggleFolder: input.onToggleFolder,
    onToggleSameLevel: () => input.onToggleSameLevel(!input.collapsed),
    onToggleAll: input.onToggleAll,
    onDuplicate: () => {
      void duplicateFolder(folder)
        .then(async (id) => {
          if (input.folderIcon) {
            await saveFolderPresentation(id, { icon: input.folderIcon });
          }
          await folders.refresh();
          input.onStartEditing(id);
        })
        .catch((cause: unknown) =>
          notify({
            id: "folder-duplicate",
            title: "Couldn't duplicate folder",
            description: errorCopy(cause, "Try again."),
          }),
        );
    },
    onSaveAsTemplate: () =>
      openFolderTemplateDialog({
        mode: "save",
        folderId: folder.id,
        folderName: folder.name,
      }),
    onExportFiles: () => void exportFolderFiles(input.exportIds),
    onExportFilesZip: () =>
      void exportFolderFiles(input.exportIds, { zip: true }),
    onExportCsv: () => void exportFolderCsv(input.exportIds),
    onExportEaglePackage: () => void exportFolderEaglePackage(input.exportIds),
    onExportPackage: () => void exportFolderPackage(input.exportIds),
    onCopyToLibrary: () => void copyFolderToLibrary(input.exportIds),
    onCreateCanvas: () =>
      void createCanvasFromFolderSaves(folder.name, input.exportIds),
    canvasItems: buildFolderCanvasItems(input.exportIds),
    onCopyLink: () => copyFolderLink(folder.id),
    onToggleSubfolders: (next) => {
      if (input.viewing) {
        setIncludeSubfolders(next);
      } else {
        void saveFolderPresentation(folder.id, {
          includeSubfolders: next,
        }).catch(() =>
          notify({
            id: "folder-subfolders",
            title: "Couldn't save subfolder setting",
          }),
        );
      }
    },
    onCustomize: input.onCustomize,
    onRemove: () => {
      window.setTimeout(
        () =>
          confirmRemoveFolder({
            id: folder.id,
            name: folder.name,
            onRemoved: async () => {
              await folders.refresh();
              const nav = getLibraryNav();
              if (nav?.kind === "folder" && nav.id === folder.id) {
                selectLibraryNav({ kind: "all" });
              }
            },
          }),
        0,
      );
    },
  });
  const customizeIndex = items.findIndex(
    (item) => "label" in item && item.label === "Customize Folder",
  );
  const quickIndex = input.quickAccessFolderIds.indexOf(folder.id);
  items.splice(
    Math.max(0, customizeIndex),
    0,
    {
      type: "submenu",
      label: "Icon",
      icon: createElement(IconMediaLibrary),
      items: folderIconMenuItems({
        folderId: folder.id,
        icon: input.folderIcon,
        glyphs: true,
      }),
    },
    {
      type: "submenu",
      label: "Color",
      icon: createElement(IconPalette),
      items: folderColorMenuItems({ folder, glyphs: true }),
    },
    {
      type: "submenu",
      label: "Sort By",
      icon: createElement(IconSortArrows),
      items: (
        [
          ["savedAt", "Date Saved", IconCalendarDate],
          ["createdAt", "Date Added", IconCalendarPlus],
          ["title", "Title", IconSortAlphaAscending],
          ["type", "Type", IconMediaLibrary],
          ["random", "Random", IconDice],
        ] as const
      ).map(([key, label, Icon]) => ({
        type: "checkbox",
        label,
        icon: createElement(Icon),
        checked: input.folderSortKey === key,
        onCheckedChange: () => {
          if (input.viewing) {
            setSort({ key, dir: input.folderSortDir });
          } else {
            void saveFolderPresentation(folder.id, {
              sortKey: key,
              sortDir: input.folderSortDir,
            });
          }
        },
      })),
    },
    {
      type: "checkbox",
      label: "Quick Access",
      icon: createElement(IconQuickAccess),
      checked: input.quickAccess ?? false,
      onCheckedChange: (quickAccess) => {
        void saveFolderPresentation(folder.id, {
          quickAccess,
          quickAccessOrder: quickAccess
            ? input.quickAccessFolderIds.length
            : undefined,
        }).catch(() =>
          notify({
            id: "folder-quick-access",
            title: "Couldn't update Quick Access",
          }),
        );
      },
    },
    {
      label: "Move Up in Quick Access",
      icon: createElement(IconArrowUp),
      hidden: !input.quickAccess || quickIndex <= 0,
      onClick: () =>
        void moveQuickAccess(folder.id, input.quickAccessFolderIds, -1),
    },
    {
      label: "Move Down in Quick Access",
      icon: createElement(IconArrowDown),
      hidden:
        !input.quickAccess ||
        quickIndex < 0 ||
        quickIndex >= input.quickAccessFolderIds.length - 1,
      onClick: () =>
        void moveQuickAccess(folder.id, input.quickAccessFolderIds, 1),
    },
  );
  return items;
}
