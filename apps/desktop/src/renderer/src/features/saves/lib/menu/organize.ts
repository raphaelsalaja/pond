import {
  IconCanvas,
  IconClipboard,
  IconFolderPlus,
  IconFolderSend,
  IconFolders,
  IconImage,
  IconPencil,
  IconPinTack,
  IconPlus,
  IconRename,
  IconTagPlus,
} from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import {
  focusPaneTitle,
  openTagPicker,
  pasteTags,
} from "@/features/saves/lib/actions";
import {
  assignSavesToFolder,
  createFolderWithSaves,
  removeSavesFromFolder,
} from "@/features/saves/lib/folder-actions";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import { pasteTagsForSelection } from "@/features/saves/lib/selection";
import { buildFolderTreeMenu } from "@/shared/lib/folder-tree-menu";
import { formatPlural } from "@/shared/lib/format";
import { shortcutGlyphs } from "@/shared/lib/shortcuts";
import { notify } from "@/shared/lib/toast";
import { glyph } from "./shared";
import type { SaveMenuContext } from "./types";

function buildFolderItems(ids: string[], batch: boolean): MenuItemSpec[] {
  const counts = new Map<string, number>();
  for (const id of ids)
    for (const folder of saveLibraryBridge.foldersForSave(id))
      counts.set(folder.id, (counts.get(folder.id) ?? 0) + 1);
  return [
    ...buildFolderTreeMenu(
      saveLibraryBridge.foldersSnapshot(),
      (folder, icon) => {
        const inAll = counts.get(folder.id) === ids.length;
        return {
          type: "checkbox",
          label: folder.name,
          icon,
          checked: inAll,
          onCheckedChange: () =>
            void (inAll
              ? removeSavesFromFolder(ids, folder)
              : assignSavesToFolder(ids, folder)),
        };
      },
    ),
    { type: "separator" },
    {
      label: "New Folder",
      icon: glyph(IconFolderPlus),
      hidden: batch,
      onClick: () => createFolderWithSaves(ids),
    },
  ];
}

function buildCanvasItems(ids: string[]): MenuItemSpec[] {
  return [
    ...saveLibraryBridge.canvasesSnapshot().map((canvas): MenuItemSpec => {
      const onCanvas = new Set(canvas.saveIds);
      const inAll = ids.every((id) => onCanvas.has(id));
      return {
        type: "checkbox",
        label: canvas.name,
        icon: glyph(IconCanvas),
        checked: inAll,
        disabled: inAll,
        onCheckedChange: () =>
          saveLibraryBridge.addSavesToCanvas(canvas.id, ids),
      };
    }),
    { type: "separator" },
    {
      label: "New Canvas",
      icon: glyph(IconPlus),
      onClick: () => saveLibraryBridge.createCanvasWithSaves(ids),
    },
  ];
}

function buildAddItems(ids: string[], batch: boolean): MenuItemSpec[] {
  const lastFolderId = saveLibraryBridge.lastUsedFolderId();
  const lastFolder = lastFolderId
    ? (saveLibraryBridge
        .foldersSnapshot()
        .find((folder) => folder.id === lastFolderId) ?? null)
    : null;

  return [
    {
      label: "Add Tags",
      icon: glyph(IconTagPlus),
      shortcut: shortcutGlyphs("save.add-tag"),
      onClick: () => openTagPicker(),
    },
    {
      label: lastFolder
        ? `Add to "${lastFolder.name}"`
        : "Add to Last Used Folder",
      icon: glyph(IconFolderPlus),
      hidden: !lastFolder,
      shortcut: shortcutGlyphs("save.add-to-last-folder"),
      onClick: () => {
        if (lastFolder) void assignSavesToFolder(ids, lastFolder);
      },
    },
    {
      type: "submenu",
      label: "Add to Folders",
      icon: glyph(IconFolders),
      items: buildFolderItems(ids, batch),
    },
    {
      label: `New Folder with ${formatPlural(ids.length, { one: "Save", other: "Saves" })}`,
      icon: glyph(IconFolderPlus),
      hidden: !batch,
      onClick: () => createFolderWithSaves(ids),
    },
    {
      type: "submenu",
      label: "Add to Canvas",
      icon: glyph(IconCanvas),
      items: buildCanvasItems(ids),
    },
    {
      label: "Add to Other Library",
      icon: glyph(IconFolderSend),
      onClick: () => {
        void window.pond
          .query("saves.copyToLibrary", { ids })
          .then((result) => {
            if (result.ok)
              notify({
                id: "library-copy",
                title: "Saves copied to library",
                description: `${result.imported ?? 0} copied, ${result.skipped ?? 0} already in this library.`,
              });
            else if (result.reason !== "cancelled")
              notify({
                id: "library-copy",
                title: result.error || "Couldn't copy saves",
              });
          })
          .catch(() =>
            notify({ id: "library-copy", title: "Couldn't copy saves" }),
          );
      },
    },
  ];
}

export interface OrganizeMenuItems {
  destinations: MenuItemSpec[];
  editing: MenuItemSpec[];
}

export function buildOrganizeItems(
  context: SaveMenuContext,
): OrganizeMenuItems {
  const {
    save,
    ids,
    batch,
    clipboardEmpty,
    inFolder,
    isPinned,
    isCover,
    resolvedFolderId,
    resolvedPinned,
  } = context;

  return {
    destinations: buildAddItems(ids, batch),
    editing: [
      {
        label: "Rename",
        icon: glyph(IconPencil),
        hidden: !context.canRename,
        shortcut: shortcutGlyphs("save.rename"),
        onClick: () => focusPaneTitle(),
      },
      {
        label: "Rename Saves",
        icon: glyph(IconRename),
        hidden: !batch,
        onClick: () => saveLibraryBridge.openRename(ids),
      },
      {
        label: "Paste Tags",
        icon: glyph(IconClipboard),
        disabled: clipboardEmpty,
        shortcut: shortcutGlyphs("save.paste-tags"),
        onClick: () => {
          if (batch) void pasteTagsForSelection(ids);
          else void pasteTags(save);
        },
      },
      {
        label: isPinned ? "Unpin from Top" : "Pin to Top",
        icon: glyph(IconPinTack),
        hidden: !inFolder || batch,
        onClick: () => {
          if (!resolvedFolderId) return;
          const next = isPinned
            ? resolvedPinned.filter((id) => id !== save.id)
            : [save.id, ...resolvedPinned.filter((id) => id !== save.id)];
          void saveLibraryBridge.saveFolderPresentation(resolvedFolderId, {
            pinnedIds: [...next],
          });
        },
      },
      {
        label: isCover ? "Remove Folder Cover" : "Set as Folder Cover",
        icon: glyph(IconImage),
        hidden: !inFolder || batch,
        onClick: () => {
          if (!resolvedFolderId) return;
          void saveLibraryBridge.saveFolderPresentation(resolvedFolderId, {
            coverSaveId: isCover ? null : save.id,
          });
        },
      },
    ],
  };
}
