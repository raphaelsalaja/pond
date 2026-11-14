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
import { libraryFolderLink } from "@shared/library-links";
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
import { buildMoveFolderItems } from "@/features/library/lib/move-folders-menu";
import { saveFolderPresentation } from "@/features/library/state/folder-presentation";
import { folders } from "@/features/library/state/folders";
import type { LibraryNav } from "@/features/library/state/library-chrome";
import { openOrganizationRenameDialog } from "@/features/library/state/organization-rename-dialog";
import {
  setIncludeSubfolders,
  setSort,
} from "@/features/library/state/view-store";
import { errorCopy } from "@/shared/lib/error-copy";
import {
  FOLDER_MENU_ICONS,
  FOLDER_SWATCHES,
  type FolderIconId,
} from "@/shared/lib/folder-icons";
import { notify } from "@/shared/lib/toast";
import { selectLibraryNav } from "./navigation";

interface FolderRowMenuInput {
  collapsed: boolean;
  creating: boolean;
  exportIds: string[];
  folder: Folder;
  folderIcon?: FolderIconId;
  folderSortDir: "asc" | "desc";
  folderSortKey: string;
  hasChildren: boolean;
  includeSubfolders: boolean;
  quickAccess?: boolean;
  nav: LibraryNav;
  sameLevelHasChildren: boolean;
  viewing: boolean;
  quickAccessFolderIds: string[];
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
  folderIds: string[],
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
  folderIds: string[];
  onOpen: () => void;
}) {
  const index = input.folderIds.indexOf(input.folder.id);
  return [
    { label: "Open Folder", onClick: input.onOpen },
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
        .catch((error) =>
          notify({
            id: "folder-duplicate",
            title: "Couldn't duplicate folder",
            description: errorCopy(error, "Try again."),
          }),
        );
    },
    onExportFiles: () => void exportFolderFiles(input.exportIds),
    onExportCsv: () => void exportFolderCsv(input.exportIds),
    onExportEaglePackage: () => void exportFolderEaglePackage(input.exportIds),
    onExportPackage: () => void exportFolderPackage(input.exportIds),
    onCopyToLibrary: () => void copyFolderToLibrary(input.exportIds),
    onCreateCanvas: () =>
      void createCanvasFromFolderSaves(folder.name, input.exportIds),
    canvasItems: buildFolderCanvasItems(input.exportIds),
    onCopyLink: () => {
      void window.pond
        .query("clipboard.writeText", {
          text: libraryFolderLink(window.pond.libraryId(), folder.id),
        })
        .then(() => notify({ id: "folder-link", title: "Folder link copied" }));
    },
    onToggleSubfolders: (next) => {
      if (input.viewing) setIncludeSubfolders(next);
      else
        void saveFolderPresentation(folder.id, {
          includeSubfolders: next,
        }).catch(() =>
          notify({
            id: "folder-subfolders",
            title: "Couldn't save subfolder setting",
          }),
        );
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
              if (input.nav.kind === "folder" && input.nav.id === folder.id) {
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
      items: FOLDER_MENU_ICONS.map((option) => ({
        type: "checkbox",
        label: option.label,
        icon: createElement(option.Icon),
        checked: (input.folderIcon ?? "folder") === option.id,
        onCheckedChange: () =>
          void saveFolderPresentation(folder.id, { icon: option.id }),
      })),
    },
    {
      type: "submenu",
      label: "Color",
      icon: createElement(IconPalette),
      items: FOLDER_SWATCHES.map((option) => ({
        type: "checkbox",
        label: option.label,
        icon: createElement("span", {
          "aria-hidden": true,
          style: {
            width: 14,
            height: 14,
            border: "1px solid currentColor",
            borderRadius: "50%",
            background: option.css,
          },
        }),
        checked: folder.color === option.id,
        onCheckedChange: () => {
          void window.pond
            .query("folders.setColor", { id: folder.id, color: option.id })
            .then(() => folders.refresh())
            .catch(() =>
              notify({
                id: "folder-color",
                title: "Couldn't update folder color",
              }),
            );
        },
      })),
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
          if (input.viewing) setSort({ key, dir: input.folderSortDir });
          else
            void saveFolderPresentation(folder.id, {
              sortKey: key,
              sortDir: input.folderSortDir,
            });
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
