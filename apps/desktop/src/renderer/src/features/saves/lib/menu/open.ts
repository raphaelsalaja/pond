import {
  IconApplications,
  IconArrowUpRight,
  IconExternalLink,
  IconFolder,
  IconFolderOpen,
  IconGrid,
  IconOpenInNewWindow,
  IconWindowShare,
} from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import { previewMediaType } from "@shared/preview-window-contracts";
import {
  openDefaultApp,
  openInBrowser,
  resolveFileIndex,
  revealFile,
} from "@/features/saves/lib/actions";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import { openWithMenuItems } from "@/features/saves/lib/open-with-menu";
import { openSave } from "@/features/saves/lib/save-nav";
import {
  openDefaultAppForSelection,
  openInBrowserForSelection,
  revealFilesForSelection,
} from "@/features/saves/lib/selection";
import { openReferenceWindow } from "@/features/saves/lib/viewer-actions";
import { REVEAL_LABEL } from "@/shared/lib/platform";
import { shortcutGlyphs } from "@/shared/lib/shortcuts";
import { glyph } from "./shared";
import type { SaveMenuContext } from "./types";

function openFolderLocation(folderId: string): void {
  saveLibraryBridge.showNav({ kind: "folder", id: folderId });
}

function openAllSaves(): void {
  saveLibraryBridge.showNav({ kind: "all" });
}

function fileLocationItems(
  entries: ReadonlyArray<{ id: string; name: string }>,
): Array<MenuItemSpec> {
  return [
    {
      label: "All",
      icon: glyph(IconGrid),
      onClick: openAllSaves,
    },
    { type: "separator" },
    ...entries.map((folder) => ({
      label: folder.name,
      icon: glyph(IconFolder),
      onClick: () => openFolderLocation(folder.id),
    })),
  ];
}

export function buildOpenItems({
  save,
  ids,
  batch,
  opened,
  hasFiles,
  fileIndex,
  openWithApps,
  hasHttpUrl,
  targetFile,
}: SaveMenuContext): Array<MenuItemSpec> {
  const openWithItems = hasFiles
    ? openWithMenuItems(ids, fileIndex, openWithApps)
    : [];

  return [
    {
      label: "Open Save",
      icon: glyph(IconArrowUpRight),
      hidden: batch || opened,
      shortcut: shortcutGlyphs("grid.open"),
      onClick: () => openSave(save.id),
    },
    {
      label: "Open in New Window",
      icon: glyph(IconOpenInNewWindow),
      hidden: batch || !targetFile || previewMediaType(targetFile) === null,
      onClick: () => {
        const index = resolveFileIndex(save, fileIndex);
        if (index !== null) {
          openReferenceWindow(save.id, index);
        }
      },
    },
    {
      label: "Open with Default App",
      icon: glyph(IconWindowShare),
      hidden: !hasFiles,
      shortcut: shortcutGlyphs("save.open"),
      onClick: () => {
        if (batch) {
          void openDefaultAppForSelection(ids);
        } else {
          void openDefaultApp(save, fileIndex);
        }
      },
    },
    {
      type: "submenu",
      label: "Open With",
      icon: glyph(IconApplications),
      hidden: openWithItems.length === 0,
      items: openWithItems,
    },
    { type: "separator" },
    {
      label: REVEAL_LABEL,
      icon: glyph(IconFolderOpen),
      keywords: "finder explorer",
      hidden: !hasFiles,
      shortcut: shortcutGlyphs("save.reveal"),
      onClick: () => {
        if (batch) {
          void revealFilesForSelection(ids);
        } else {
          void revealFile(save, fileIndex);
        }
      },
    },
    {
      type: "submenu",
      label: "Navigate to Folder",
      icon: glyph(IconFolder),
      hidden: batch || saveLibraryBridge.foldersForSave(save.id).length === 0,
      items: fileLocationItems(saveLibraryBridge.foldersForSave(save.id)),
    },
    batch
      ? {
          label: "Open Original in Browser",
          icon: glyph(IconExternalLink),
          hidden: !hasHttpUrl,
          shortcut: shortcutGlyphs("save.open-url"),
          onClick: () => void openInBrowserForSelection(ids),
        }
      : {
          type: "link",
          label: "Open Original in Browser",
          icon: glyph(IconExternalLink),
          hidden: !hasHttpUrl,
          shortcut: shortcutGlyphs("save.open-url"),
          href: save.url ?? "",
          onClick: () => void openInBrowser(save),
        },
  ];
}
