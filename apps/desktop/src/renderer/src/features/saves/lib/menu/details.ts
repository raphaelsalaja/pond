import {
  IconArchive,
  IconArrowRotateClockwise,
  IconClipboardArrowIn,
  IconContrast,
  IconCopy,
  IconDownload,
  IconFile,
  IconFocus,
  IconGrid,
  IconImageMinus,
  IconImagePlus,
  IconMagicWand,
  IconMerge,
  IconRefresh,
  IconTrash,
  IconUngroup,
} from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import { createElement } from "react";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import { deriveTypeKind } from "@/features/saves/lib/media/units";
import { pondFileUrl } from "@/features/saves/lib/media/url";
import {
  archiveSitesForSelection,
  refreshDetailsForSelection,
} from "@/features/saves/lib/selection";
import { splitIntoSaves } from "@/features/saves/lib/split-save";
import { viewerMemory } from "@/features/saves/lib/viewer-memory";
import { inspect } from "@/features/saves/state/inspect";
import { shortcutGlyphs } from "@/shared/lib/shortcuts";
import { notify } from "@/shared/lib/toast";
import { getPrefsSnapshot, savePrefsSection } from "@/shared/state/prefs";
import { glyph } from "./shared";
import type { SaveMenuContext } from "./types";

function buildThumbnailBackgroundItems(): MenuItemSpec[] {
  const thumbnailBackground =
    getPrefsSnapshot()?.viewer?.thumbnailBackground ?? "none";
  return (
    [
      ["none", "None"],
      ["black", "Black"],
      ["gray", "Gray"],
      ["white", "White"],
      ["grid", "Grid"],
    ] as const
  ).map(([value, label]) => ({
    type: "checkbox",
    label,
    icon: createElement("span", {
      "aria-hidden": true,
      style: {
        width: 14,
        height: 14,
        border: "1px solid currentColor",
        borderRadius: 3,
        background:
          value === "grid"
            ? "conic-gradient(#b6b6b6 25%, #fff 0 50%, #b6b6b6 0 75%, #fff 0) 0 0 / 6px 6px"
            : value === "none"
              ? "linear-gradient(135deg, transparent 45%, currentColor 46% 54%, transparent 55%)"
              : value,
      },
    }),
    checked: thumbnailBackground === value,
    onCheckedChange: () => {
      void savePrefsSection("viewer", { thumbnailBackground: value });
    },
  }));
}

export function buildViewerDisplayItems(
  context: SaveMenuContext,
): MenuItemSpec[] {
  const visible =
    context.opened &&
    !context.batch &&
    deriveTypeKind(context.targetFile, context.save) === "image";
  const state = inspect.snapshot();

  return [
    {
      type: "checkbox",
      label: "Navigator",
      icon: glyph(IconFocus),
      indicator: "check",
      hidden: !visible,
      checked: state.showNavigator,
      onCheckedChange: (checked) => inspect.setShowNavigator(checked),
    },
    {
      type: "checkbox",
      label: "Grayscale",
      icon: glyph(IconContrast),
      indicator: "check",
      hidden: !visible,
      checked: state.grayscale,
      onCheckedChange: (checked) => inspect.setGrayscale(checked),
    },
  ];
}

function downloadVideoTitle(queued: number): string {
  if (queued === 0) return "No videos to download";
  if (queued === 1) return "Downloading video";
  return `Downloading ${queued} videos`;
}

function removeVideoTitle(removed: number): string {
  if (removed === 0) return "No videos to remove";
  if (removed === 1) return "Video removed";
  return `${removed} videos removed`;
}

export interface DetailMenuItems {
  file: MenuItemSpec[];
  media: MenuItemSpec[];
  organization: MenuItemSpec[];
  source: MenuItemSpec[];
  thumbnail: MenuItemSpec[];
}

export function buildDetailItems({
  save,
  ids,
  batch,
  opened,
  isGif,
  isVideo,
  canDownloadVideo,
  canRemoveVideo,
  fileIndex,
  hasFiles,
  canResetThumbnail,
  hasUrl,
  archivable,
  canSplit,
}: SaveMenuContext): DetailMenuItems {
  return {
    organization: [
      {
        label: "Find Duplicates",
        icon: glyph(IconCopy),
        hidden: batch,
        onClick: () => saveLibraryBridge.openDuplicateReview(save.id),
      },
      {
        label: "Merge Duplicates",
        icon: glyph(IconMerge),
        hidden: batch,
        onClick: () => saveLibraryBridge.openDuplicateReview(save.id),
      },
      {
        label: "Split Into Saves",
        icon: glyph(IconUngroup),
        hidden: !canSplit,
        shortcut: shortcutGlyphs("save.split"),
        onClick: () => splitIntoSaves(ids),
      },
    ],
    media: [
      {
        label: "Re-analyze Colors",
        icon: glyph(IconMagicWand),
        hidden: batch || save.mediaType !== "image",
        onClick: () => {
          void window.pond
            .query("saves.reanalyzeColors", { id: save.id })
            .then((result) =>
              notify({
                id: "analyze-colors",
                title: result.ok ? "Colors updated" : "Couldn't analyze colors",
              }),
            );
        },
      },
      {
        label: "Reset Loop Range",
        icon: glyph(IconArrowRotateClockwise),
        hidden: !opened || !isGif,
        onClick: () => {
          const file = save.files[fileIndex ?? 0] ?? save.files[0];
          if (!file) return;
          const src = pondFileUrl(save.id, file.path);
          viewerMemory.setLoop(src, null);
        },
      },
      {
        label: "Set Current Frame as Thumbnail",
        icon: glyph(IconImagePlus),
        hidden: !opened || !isGif,
        onClick: () => {
          const file = save.files[fileIndex ?? 0] ?? save.files[0];
          if (!file) return;
          const src = pondFileUrl(save.id, file.path);
          const canvas = document.querySelector<HTMLCanvasElement>(
            `[data-gif-player] canvas[data-frame]`,
          );
          const frameIndex = Number(canvas?.getAttribute("data-frame") ?? 0);
          void window.pond
            .query("saves.setGifThumbnail", {
              id: save.id,
              src,
              frameIndex: Number.isFinite(frameIndex) ? frameIndex : 0,
            })
            .then((result) => {
              if (!result.ok)
                notify({
                  id: "gif-thumb",
                  title: "Couldn't set the current frame as thumbnail",
                });
            });
        },
      },
      {
        label: "Load Subtitles",
        icon: glyph(IconFile),
        hidden: !isVideo,
        onClick: () => {
          void window.pond
            .query("saves.loadSubtitles", { id: save.id })
            .then((result) => {
              if (!result.ok && result.reason !== "cancelled")
                notify({
                  id: "subtitles",
                  title: "Couldn't load subtitles",
                });
            });
        },
      },
      {
        label: "Download Video",
        icon: glyph(IconDownload),
        hidden: !canDownloadVideo,
        onClick: () => {
          void window.pond
            .query("saves.downloadVideo", { ids })
            .then((result) =>
              notify({
                id: "download-video",
                title: result.ok
                  ? downloadVideoTitle(result.queued)
                  : "Couldn't download video",
              }),
            );
        },
      },
      {
        label: "Remove Video",
        icon: glyph(IconTrash),
        variant: "destructive",
        hidden: !canRemoveVideo,
        onClick: () => {
          void window.pond.query("saves.removeVideo", { ids }).then((result) =>
            notify({
              id: "remove-video",
              title: result.ok
                ? removeVideoTitle(result.removed)
                : "Couldn't remove video",
            }),
          );
        },
      },
      {
        label: "Refresh Video Poster",
        icon: glyph(IconRefresh),
        hidden: batch || !isVideo,
        onClick: () => {
          void window.pond
            .query("saves.regeneratePoster", { id: save.id })
            .then((result) =>
              notify({
                id: "video-poster",
                title: result.ok
                  ? "Video poster refreshed"
                  : "Couldn't refresh video poster",
              }),
            );
        },
      },
    ],
    file: [
      {
        label: "Replace File",
        icon: glyph(IconFile),
        hidden: batch || !hasFiles,
        onClick: () => {
          void window.pond
            .query("saves.replaceFile", { id: save.id })
            .then((result) => {
              if (!result.ok) {
                if (result.reason === "cancelled") return;
                notify({
                  id: "replace-file",
                  title: result.error,
                });
              }
            });
        },
      },
    ],
    source: [
      {
        label: "Refresh from Source",
        icon: glyph(IconArrowRotateClockwise),
        hidden: !hasUrl,
        shortcut: shortcutGlyphs("save.refresh"),
        onClick: () => {
          if (batch) {
            void refreshDetailsForSelection(ids);
            return;
          }
          if (save.url) void window.pond.refreshSave(save.id);
        },
      },
      {
        label: "Archive Site",
        icon: glyph(IconArchive),
        hidden: !archivable,
        onClick: () => {
          if (batch) void archiveSitesForSelection(ids);
          else void window.pond.archiveSite(save.id);
        },
      },
    ],
    thumbnail: [
      {
        label: "Set Thumbnail from File",
        icon: glyph(IconImagePlus),
        hidden: batch,
        onClick: () => {
          void window.pond.query("saves.setCustomThumbnail", { id: save.id });
        },
      },
      {
        label: "Set Thumbnail from Clipboard",
        icon: glyph(IconClipboardArrowIn),
        hidden: batch,
        onClick: () => {
          void window.pond
            .query("saves.setThumbnailFromClipboard", { id: save.id })
            .then((result) => {
              if (!result.ok)
                notify({
                  id: "thumbnail-clipboard",
                  title: "No image found on the clipboard",
                });
            });
        },
      },
      {
        label: "Reset Thumbnail",
        icon: glyph(IconImageMinus),
        variant: "destructive",
        hidden: batch || !canResetThumbnail,
        onClick: () => {
          void window.pond.query("saves.removeCustomThumbnail", {
            id: save.id,
          });
        },
      },
      {
        type: "submenu",
        label: "Thumbnail Background",
        icon: glyph(IconGrid),
        hidden: opened || batch,
        items: buildThumbnailBackgroundItems(),
      },
    ],
  };
}
