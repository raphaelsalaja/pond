import {
  canDestructivelyEditImage,
  canRequestNativeThumbnail,
  classifyLibraryFile,
} from "@shared/file-format";
import { ARTICLE_KIND } from "@shared/save-file-names";
import type { SaveFile } from "@/features/saves/types";

export type FileViewerKind =
  | "media"
  | "pdf"
  | "audio"
  | "font"
  | "text"
  | "epub"
  | "model"
  | "archive"
  | "live-photo"
  | "safe-web"
  | "article"
  | "native-preview"
  | "generic";

type SpecialistViewerKind = Exclude<
  FileViewerKind,
  "media" | "native-preview" | "generic"
>;

export type ViewerCapability =
  | {
      kind: "media" | "native-preview";
      surface: "raster";
      source: "original" | "generated";
      edits: "full" | "none";
      originalActions: true;
    }
  | {
      kind: "media";
      surface: "temporal";
      originalActions: true;
    }
  | {
      kind: SpecialistViewerKind;
      surface: "specialist";
      originalActions: true;
    }
  | {
      kind: "generic";
      surface: "fallback";
      originalActions: true;
    };

const INTERACTIVE_MODELS = new Set([
  "glb",
  "gltf",
  "fbx",
  "obj",
  "3ds",
  "3mf",
  "amf",
  "dae",
  "ply",
  "stl",
  "usdc",
  "usdz",
  "vtk",
]);

function originalRaster(file: SaveFile): ViewerCapability {
  return {
    kind: "media",
    surface: "raster",
    source: "original",
    edits: canDestructivelyEditImage(file.path) ? "full" : "none",
    originalActions: true,
  };
}

function generatedRaster(kind: "media" | "native-preview"): ViewerCapability {
  return {
    kind,
    surface: "raster",
    source: "generated",
    edits: "none",
    originalActions: true,
  };
}

function temporal(): ViewerCapability {
  return {
    kind: "media",
    surface: "temporal",
    originalActions: true,
  };
}

function specialist(kind: SpecialistViewerKind): ViewerCapability {
  return {
    kind,
    surface: "specialist",
    originalActions: true,
  };
}

export function viewerCapabilityFor(file: SaveFile): ViewerCapability {
  if (file.kind === ARTICLE_KIND) return specialist("article");
  const format = classifyLibraryFile(file.path, file.mimeType);

  switch (format.previewKind) {
    case "direct-image":
      return originalRaster(file);
    case "native-image":
      return generatedRaster("media");
    case "video":
      return temporal();
    case "pdf":
      return specialist("pdf");
    case "audio":
      return specialist("audio");
    case "font":
      return specialist("font");
    case "text":
      return specialist("text");
    case "generic":
      break;
  }

  if (format.extension === "epub") return specialist("epub");
  if (format.extension === "livp") return specialist("live-photo");
  if (INTERACTIVE_MODELS.has(format.extension)) return specialist("model");
  if (["zip", "rar", "7z", "lottie"].includes(format.extension)) {
    return specialist("archive");
  }
  if (["html", "mhtml", "mht"].includes(format.extension)) {
    return specialist("safe-web");
  }
  if (format.mediaType === "video") {
    return temporal();
  }
  if (
    canRequestNativeThumbnail(file.path) &&
    format.mimeType !== "application/octet-stream"
  ) {
    return generatedRaster("native-preview");
  }
  return {
    kind: "generic",
    surface: "fallback",
    originalActions: true,
  };
}
