import {
  IconBinary,
  IconChatBubble,
  IconCopy,
  IconGlobe,
  IconImage,
  IconLink2,
  IconPath,
  IconTag,
  IconText,
} from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import { isThumbnailKind } from "@shared/save-file-names";
import {
  copyBase64,
  copyFilePath,
  copyName,
  copyPrimaryMedia,
  copyTags,
  copyThumbnail,
  copyUrl,
} from "@/features/saves/lib/actions";
import {
  copyFilePathsForSelection,
  copyFilesForSelection,
  copyNamesForSelection,
  copyTagsForSelection,
  copyUrlsForSelection,
} from "@/features/saves/lib/selection";
import { shortcutGlyphs } from "@/shared/lib/shortcuts";
import { notify } from "@/shared/lib/toast";
import { glyph, notifyCopy, submenuHidden } from "./shared";
import type { SaveMenuContext } from "./types";

export function buildCopyItems({
  save,
  ids,
  batch,
  copyLabel,
  hasFiles,
  fileIndex,
  hasUrl,
  hasTags,
  allTrashed,
}: SaveMenuContext): Array<MenuItemSpec> {
  const more: Array<MenuItemSpec> = [
    {
      label: "Copy Thumbnail",
      icon: glyph(IconImage),
      hidden: batch || !save.files.some((file) => isThumbnailKind(file.kind)),
      onClick: () => void copyThumbnail(save),
    },
    {
      label: "Copy as Base64",
      icon: glyph(IconBinary),
      hidden: batch || !hasFiles,
      onClick: () => void copyBase64(save, fileIndex),
    },
    {
      label: "Copy Pond Link",
      icon: glyph(IconLink2),
      onClick: () => {
        void window.pond
          .query("saves.copyInternalLinks", { ids })
          .then(() =>
            notify({
              id: "copy-pond-link",
              title: ids.length > 1 ? "Pond links copied" : "Pond link copied",
            }),
          )
          .catch(() =>
            notify({ id: "copy-pond-link", title: "Couldn't copy Pond link" }),
          );
      },
    },
    {
      label: "Copy URL",
      icon: glyph(IconGlobe),
      hidden: !hasUrl,
      shortcut: shortcutGlyphs("save.copy-url"),
      onClick: () => {
        if (batch) {
          void copyUrlsForSelection(ids).then(notifyCopy);
          return;
        }
        if (save.url) {
          void copyUrl(save.url);
        }
      },
    },
  ];

  return [
    {
      label: "Copy Name",
      icon: glyph(IconText),
      onClick: () => {
        if (batch) {
          void copyNamesForSelection(ids).then(notifyCopy);
        } else {
          void copyName(save);
        }
      },
    },
    {
      id: "copy-primary",
      label: copyLabel,
      icon: glyph(IconCopy),
      hidden: !hasFiles,
      shortcut: shortcutGlyphs("save.copy-image"),
      onClick: () => {
        if (batch) {
          void copyFilesForSelection(ids);
        } else {
          void copyPrimaryMedia(save, fileIndex);
        }
      },
    },
    {
      label: "Copy Prompt",
      icon: glyph(IconChatBubble),
      keywords: "agent ai chat context markdown",
      hidden: allTrashed,
      onClick: () => {
        void window.pond
          .query("saves.copyPrompt", { ids })
          .then((result) =>
            notify({
              id: "copy-prompt",
              title: result.ok ? "Prompt copied" : "Couldn't copy prompt",
            }),
          )
          .catch(() =>
            notify({ id: "copy-prompt", title: "Couldn't copy prompt" }),
          );
      },
    },
    {
      label: "Copy File Path",
      icon: glyph(IconPath),
      hidden: !hasFiles,
      onClick: () => {
        if (batch) {
          void copyFilePathsForSelection(ids).then(notifyCopy);
          return;
        }
        void copyFilePath(save, fileIndex);
      },
    },
    {
      type: "submenu",
      label: "Copy Options",
      icon: glyph(IconCopy),
      hidden: submenuHidden(more),
      items: more,
    },
    {
      label: "Copy Tags",
      icon: glyph(IconTag),
      hidden: !hasTags,
      shortcut: shortcutGlyphs("save.copy-tags"),
      onClick: () => {
        if (batch) {
          void copyTagsForSelection(ids);
        } else {
          copyTags(save);
        }
      },
    },
  ];
}
