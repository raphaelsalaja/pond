import {
  IconArchive,
  IconArchiveExport,
  IconConversion,
  IconFileExport,
  IconFileZip,
  IconGauge,
  IconImage,
  IconImageBinary,
  IconImageMinus,
  IconImageSparkle,
  IconImageUpscale,
  IconShieldCheck,
  IconTableDownload,
} from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import {
  exportSelectionCsv,
  exportSelectionFiles,
} from "@/features/saves/lib/selection";
import { formatPlural } from "@/shared/lib/format";
import { shortcutGlyphs } from "@/shared/lib/shortcuts";
import { notify } from "@/shared/lib/toast";
import { glyph } from "./shared";
import type { SaveMenuContext } from "./types";

function compressibleImageCount(context: SaveMenuContext): number {
  return context.saves.filter((save) =>
    save.files.some((file) =>
      /\.(gif|jpe?g|jfif|png|svg|webp)$/i.test(file.path),
    ),
  ).length;
}

function startWebpConvert(
  ids: string[],
  fileIndex: number,
  format: "png" | "jpeg",
) {
  return window.pond.query("conversion.start", {
    ids,
    fileIndex,
    preset: {
      id: `webp-${format}`,
      name: format === "png" ? "PNG" : "JPG",
      format,
      width: null,
      height: null,
      quality: format === "png" ? 100 : 90,
      lossless: false,
      start: 0,
      duration: 5,
      fps: 12,
    },
  });
}

interface CompressionCopy {
  busy: string;
  done: string;
  failed: string;
}

function compressionCopy(
  mode: "lossless" | "quality" | "webp" | "upscale" | "remove-background",
): CompressionCopy {
  if (mode === "webp") {
    return {
      busy: "Converting to WebP",
      done: "Converted",
      failed: "Couldn't convert these images.",
    };
  }
  if (mode === "upscale") {
    return {
      busy: "Upscaling Images",
      done: "Upscaled",
      failed: "Couldn't upscale these images.",
    };
  }
  if (mode === "remove-background") {
    return {
      busy: "Removing Backgrounds",
      done: "Updated",
      failed: "Couldn't remove these backgrounds.",
    };
  }
  return {
    busy: "Compressing Images",
    done: "Compressed",
    failed: "Couldn't compress these images.",
  };
}

function compressImages(
  ids: string[],
  fileIndex: number,
  mode: "lossless" | "quality" | "webp" | "upscale" | "remove-background",
): void {
  const copy = compressionCopy(mode);
  void window.pond
    .query("conversion.compress", {
      ids,
      fileIndex,
      mode,
      quality: 85,
    })
    .then((job) => {
      notify({
        id: `image-compression-${job.id}`,
        title: copy.busy,
      });
      void pollCompression(job.id, copy);
    })
    .catch(() => {
      notify({ id: "image-compression", title: copy.failed });
    });
}

async function pollCompression(
  id: string,
  copy: { done: string; failed: string },
): Promise<void> {
  const job = await window.pond.query("conversion.status", { id });
  if (!job) return;
  if (job.status === "running") {
    setTimeout(() => void pollCompression(id, copy), 500);
    return;
  }
  const count = formatPlural(job.changed, { one: "image", other: "images" });
  notify({
    id: `image-compression-${id}`,
    title:
      job.status === "complete"
        ? `${copy.done} ${count}${job.skipped > 0 ? `. Skipped ${job.skipped}.` : ""}`
        : job.status === "cancelled"
          ? "Image Compression Canceled"
          : job.error || copy.failed,
    action:
      job.status === "complete" && job.changed > 0
        ? {
            label: "Undo",
            onClick: () => {
              void window.pond.undo();
            },
          }
        : undefined,
  });
}

export function buildExportItems(context: SaveMenuContext): MenuItemSpec[] {
  const { ids, hasFiles, fileIndex, isWebp } = context;
  return [
    {
      id: "export-files",
      label: "Export Files",
      icon: glyph(IconFileExport),
      keywords: "files",
      hidden: !hasFiles,
      shortcut: shortcutGlyphs("save.export"),
      onClick: () => {
        void exportSelectionFiles(ids);
      },
    },
    {
      id: "export-files-zip",
      label: "Export Files as ZIP",
      icon: glyph(IconFileZip),
      keywords: "files zip archive compress",
      hidden: !hasFiles,
      onClick: () => {
        void exportSelectionFiles(ids, { zip: true });
      },
    },
    {
      id: "export-converted",
      label: "Export Converted Files",
      icon: glyph(IconConversion),
      hidden: !hasFiles,
      onClick: () => saveLibraryBridge.openConversion(ids, fileIndex ?? 0),
    },
    {
      type: "submenu",
      label: "Compress Images",
      icon: glyph(IconFileZip),
      hidden: compressibleImageCount(context) === 0,
      items: [
        {
          label: "Convert to WebP",
          icon: glyph(IconImage),
          onClick: () => compressImages(ids, fileIndex ?? 0, "webp"),
        },
        {
          label: "Lossless",
          icon: glyph(IconShieldCheck),
          onClick: () => compressImages(ids, fileIndex ?? 0, "lossless"),
        },
        {
          label: "Quality 85",
          icon: glyph(IconGauge),
          onClick: () => compressImages(ids, fileIndex ?? 0, "quality"),
        },
      ],
    },
    {
      type: "submenu",
      label: "Image Tools",
      icon: glyph(IconImageSparkle),
      hidden: compressibleImageCount(context) === 0,
      items: [
        {
          label: "Remove Background",
          icon: glyph(IconImageMinus),
          onClick: () =>
            compressImages(ids, fileIndex ?? 0, "remove-background"),
        },
        {
          label: "Upscale 2×",
          icon: glyph(IconImageUpscale),
          onClick: () => compressImages(ids, fileIndex ?? 0, "upscale"),
        },
      ],
    },
    {
      label: "Export as WebP",
      icon: glyph(IconImage),
      hidden: !hasFiles,
      onClick: () => {
        void window.pond.query("saves.exportWebp", { ids });
      },
    },
    {
      label: "Convert to PNG",
      icon: glyph(IconImageBinary),
      hidden: !isWebp,
      onClick: () => {
        void startWebpConvert(ids, fileIndex ?? 0, "png");
      },
    },
    {
      label: "Convert to JPG",
      icon: glyph(IconImage),
      hidden: !isWebp,
      onClick: () => {
        void startWebpConvert(ids, fileIndex ?? 0, "jpeg");
      },
    },
    {
      id: "export-eagle-package",
      label: "Export Eagle Package",
      icon: glyph(IconArchive),
      keywords: "eagle package",
      onClick: () => {
        void window.pond
          .query("saves.exportEaglePackage", { ids })
          .then((result) => {
            if (!result.ok && result.reason !== "cancelled")
              notify({
                id: "eagle-package-export",
                title: result.error || "Couldn't export Eagle package.",
              });
            else if (result.ok)
              notify({
                id: "eagle-package-export",
                title: "Eagle package exported",
              });
          });
      },
    },
    {
      label: "Export Pond Package",
      icon: glyph(IconArchiveExport),
      keywords: "package",
      onClick: () => {
        void window.pond
          .query("saves.exportPackage", { ids })
          .then((result) => {
            if (!result.ok && result.reason !== "cancelled")
              notify({
                id: "package-export",
                title: result.error || "Couldn't export package.",
              });
            else if (result.ok)
              notify({ id: "package-export", title: "Pond package exported" });
          });
      },
    },
    {
      id: "export-csv",
      label: "Export to CSV",
      icon: glyph(IconTableDownload),
      keywords: "csv",
      onClick: () => void exportSelectionCsv(ids),
    },
  ];
}

const EXPORT_POPUP_IDS = new Set([
  "export-files",
  "export-files-zip",
  "export-converted",
  "export-eagle-package",
  "export-csv",
]);

export function buildExportPopupItems(
  context: SaveMenuContext,
): MenuItemSpec[] {
  return buildExportItems(context).filter(
    (item) =>
      item.type !== "separator" &&
      "id" in item &&
      item.id !== undefined &&
      EXPORT_POPUP_IDS.has(item.id) &&
      !item.hidden,
  );
}
