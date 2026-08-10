import type { MenuItemSpec } from "@pond/ui";
import { deriveTypeKind } from "@/lib/media/units";
import {
  copyableImageIndex,
  copyFile as copyFileAction,
  copyFilePath,
  copyImage as copyImageAction,
  copyTags as copyTagsAction,
  copyUrl,
  exportFile as exportFileAction,
  openDefaultApp,
  openInBrowser,
  pasteTags as pasteTagsAction,
  resolveFileIndex,
  revealFile,
} from "@/lib/save/actions";
import { purgeSave, trashSave, untrashSave } from "@/lib/save/mutate";
import {
  REVERSE_SEARCH_ENGINES,
  reverseImageSearch,
} from "@/lib/save/reverse-image-search";
import { shortcutGlyphs } from "@/lib/save/shortcuts";
import type { Save } from "@/lib/types";
import { REVEAL_LABEL } from "@/lib/ui/platform";
import { tumbleToTrash } from "@/stores/trash-tumble";

interface BuildSaveMenuOptions {
  /** Whether the tag clipboard is empty (controls the Paste Tags item). */
  clipboardEmpty: boolean;
  /** When set (viewer slide under the cursor), file actions target that asset instead of the cover. */
  fileIndex?: number | null;
}

/** Plain function rather than a hook so a card never subscribes to the tag clipboard just to host a menu; the list is assembled lazily on open. */
export function buildSaveMenu(
  save: Save,
  { clipboardEmpty, fileIndex = null }: BuildSaveMenuOptions,
): MenuItemSpec[] {
  const hasFiles = save.files.length > 0;
  const hasTags = save.tags.length > 0;
  const isTrashed = Boolean(save.deletedAt);
  const hasUrl = Boolean(save.url);
  /** Videos and other non-image saves never get a Copy Image item; the viewer offers Copy Current Frame instead. */
  const hasImage = copyableImageIndex(save, fileIndex) != null;
  const targetIndex = resolveFileIndex(save, fileIndex);
  const targetFile =
    targetIndex != null ? (save.files[targetIndex] ?? null) : null;
  const copyFileLabel =
    deriveTypeKind(targetFile, save) === "video" ? "Copy Video" : "Copy File";

  const reverseSearchItems: MenuItemSpec[] = REVERSE_SEARCH_ENGINES.map(
    (engine) => ({
      label: engine.label,
      onClick: () => void reverseImageSearch(save, engine.key),
    }),
  );

  const restoreItems: MenuItemSpec[] = isTrashed
    ? [
        {
          label: "Restore from Trash",
          shortcut: shortcutGlyphs("save.restore"),
          onClick: () => void untrashSave(save.id),
        },
        {
          label: "Delete Forever",
          shortcut: shortcutGlyphs("save.delete-forever"),
          onClick: () => void purgeSave(save.id),
        },
      ]
    : [
        {
          label: "Move to Trash",
          shortcut: shortcutGlyphs("save.trash"),
          onClick: () =>
            void tumbleToTrash([save.id]).then(() => trashSave(save.id)),
        },
      ];

  return [
    {
      label: "Open with Default App",
      hidden: !hasFiles,
      shortcut: shortcutGlyphs("save.open"),
      onClick: () => void openDefaultApp(save, fileIndex),
    },
    {
      label: REVEAL_LABEL,
      hidden: !hasFiles,
      onClick: () => void revealFile(save, fileIndex),
    },
    { type: "separator" },
    {
      label: "Copy URL",
      hidden: !hasUrl,
      shortcut: shortcutGlyphs("save.copy-url"),
      onClick: () => {
        if (save.url) void copyUrl(save.url);
      },
    },
    {
      label: "Copy Image",
      hidden: !hasImage,
      shortcut: shortcutGlyphs("save.copy-image"),
      onClick: () => void copyImageAction(save, fileIndex),
    },
    {
      label: copyFileLabel,
      hidden: !hasFiles,
      shortcut: shortcutGlyphs("save.copy-image"),
      onClick: () => void copyFileAction(save, fileIndex),
    },
    {
      label: "Copy File Path",
      hidden: !hasFiles,
      onClick: () => void copyFilePath(save, fileIndex),
    },
    {
      label: "Copy Tags",
      hidden: !hasTags,
      shortcut: shortcutGlyphs("save.copy-tags"),
      onClick: () => copyTagsAction(save),
    },
    {
      label: "Paste Tags",
      /** Stays visible but disabled: the clipboard is transient app state, not a missing capability. */
      disabled: clipboardEmpty,
      shortcut: shortcutGlyphs("save.paste-tags"),
      onClick: () => void pasteTagsAction(save),
    },
    { type: "separator" },
    {
      type: "submenu",
      label: "Reverse Image Search",
      /** Reverse search needs a public image URL from the capture metadata; local-only saves have none. */
      hidden: !hasUrl,
      items: reverseSearchItems,
    },
    {
      label: "Export",
      hidden: !hasFiles,
      shortcut: shortcutGlyphs("save.export"),
      onClick: () => void exportFileAction(save, fileIndex),
    },
    { type: "separator" },
    ...restoreItems,
    { type: "separator" },
    {
      label: "Refresh Details",
      hidden: !hasUrl,
      shortcut: shortcutGlyphs("save.refresh"),
      onClick: () => {
        if (save.url) void window.pond.refreshSave(save.id);
      },
    },
    {
      label: "Archive Full Site",
      hidden: !(hasUrl && save.source === "web" && !isTrashed),
      onClick: () => void window.pond.archiveSite(save.id),
    },
    {
      type: "link",
      label: "Open Original URL in Browser",
      hidden: !hasUrl,
      href: save.url ?? "",
      onClick: () => void openInBrowser(save),
    },
  ];
}
