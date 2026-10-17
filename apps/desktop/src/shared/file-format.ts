import type { MediaType } from "@pond/schema/db";
import { eagleFormatGroup } from "./eagle-formats";

export type LibraryPreviewKind =
  | "direct-image"
  | "native-image"
  | "video"
  | "audio"
  | "pdf"
  | "font"
  | "text"
  | "generic";

export interface LibraryFileFormat {
  extension: string;
  mediaType: MediaType;
  mimeType: string;
  previewKind: LibraryPreviewKind;
}

const DIRECT_IMAGES = new Map<string, string>([
  ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["jpe", "image/jpeg"],
  ["jfif", "image/jpeg"],
  ["png", "image/png"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
  ["avif", "image/avif"],
  ["svg", "image/svg+xml"],
  ["bmp", "image/bmp"],
  ["ico", "image/x-icon"],
]);

const NATIVE_IMAGES = new Map<string, string>([
  ["heic", "image/heic"],
  ["heif", "image/heif"],
  ["hif", "image/heif"],
  ["jxl", "image/jxl"],
  ["tif", "image/tiff"],
  ["tiff", "image/tiff"],
]);

const DESTRUCTIVELY_EDITABLE_IMAGE_EXTENSIONS = new Set([
  "avif",
  "gif",
  "jpeg",
  "jpg",
  "png",
  "tif",
  "tiff",
  "webp",
]);

const VIDEOS = new Map<string, string>([
  ["mp4", "video/mp4"],
  ["webm", "video/webm"],
  ["mov", "video/quicktime"],
  ["m4v", "video/x-m4v"],
  ["mkv", "video/x-matroska"],
  ["avi", "video/x-msvideo"],
  ["ogv", "video/ogg"],
  ["gifv", "video/mp4"],
]);

const AUDIO = new Map<string, string>([
  ["mp3", "audio/mpeg"],
  ["wav", "audio/wav"],
  ["m4a", "audio/mp4"],
  ["aac", "audio/aac"],
  ["flac", "audio/flac"],
  ["ogg", "audio/ogg"],
  ["oga", "audio/ogg"],
  ["opus", "audio/opus"],
]);

const FONTS = new Map<string, string>([
  ["ttf", "font/ttf"],
  ["otf", "font/otf"],
  ["woff", "font/woff"],
  ["woff2", "font/woff2"],
  ["ttc", "font/collection"],
]);

const TEXT = new Map<string, string>([
  ["txt", "text/plain"],
  ["md", "text/markdown"],
  ["markdown", "text/markdown"],
  ["css", "text/css"],
  ["java", "text/x-java-source"],
  ["js", "text/javascript"],
  ["py", "text/x-python"],
  ["rs", "text/x-rust"],
  ["sql", "application/sql"],
  ["ts", "text/typescript"],
  ["json", "application/json"],
  ["jsonl", "application/x-ndjson"],
  ["csv", "text/csv"],
  ["yaml", "application/yaml"],
  ["yml", "application/yaml"],
  ["xml", "application/xml"],
]);

const GENERIC_MIME = new Map<string, string>([
  ["3dm", "model/vnd.rhino"],
  ["amf", "application/x-amf"],
  ["gltf", "model/gltf+json"],
  ["usdc", "model/vnd.usd"],
  ["usdz", "model/vnd.usdz+zip"],
  ["vtk", "model/vnd.vtk"],
  ["zip", "application/zip"],
  ["rar", "application/vnd.rar"],
  ["7z", "application/x-7z-compressed"],
  ["lottie", "application/zip+dotlottie"],
  ["livp", "application/zip+live-photo"],
  ["pag", "application/x-pag"],
  ["svga", "application/x-svga"],
]);

const EAGLE_MIME = new Map<string, string>([
  ["psd", "image/vnd.adobe.photoshop"],
  ["psdt", "image/vnd.adobe.photoshop"],
  ["psb", "image/vnd.adobe.photoshop"],
  ["ai", "application/postscript"],
  ["ait", "application/postscript"],
  ["eps", "application/postscript"],
  ["ps", "application/postscript"],
  ["cr2", "image/x-canon-cr2"],
  ["cr3", "image/x-canon-cr3"],
  ["crw", "image/x-canon-crw"],
  ["dng", "image/x-adobe-dng"],
  ["nef", "image/x-nikon-nef"],
  ["nrw", "image/x-nikon-nrw"],
  ["arw", "image/x-sony-arw"],
  ["raf", "image/x-fuji-raf"],
  ["orf", "image/x-olympus-orf"],
  ["rw2", "image/x-panasonic-rw2"],
  ["doc", "application/msword"],
  [
    "docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
  ["xls", "application/vnd.ms-excel"],
  ["xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
  ["ppt", "application/vnd.ms-powerpoint"],
  [
    "pptx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ],
  [
    "potx",
    "application/vnd.openxmlformats-officedocument.presentationml.template",
  ],
  ["pages", "application/vnd.apple.pages"],
  ["key", "application/vnd.apple.keynote"],
  ["number", "application/vnd.apple.numbers"],
  ["numbers", "application/vnd.apple.numbers"],
  ["epub", "application/epub+zip"],
  ["glb", "model/gltf-binary"],
  ["obj", "model/obj"],
  ["fbx", "application/vnd.autodesk.fbx"],
  ["3mf", "model/3mf"],
  ["stl", "model/stl"],
  ["html", "text/html"],
  ["mhtml", "multipart/related"],
  ["url", "application/internet-shortcut"],
  ["webarchive", "application/x-webarchive"],
  ["swf", "application/x-shockwave-flash"],
  ["mpeg", "video/mpeg"],
  ["mpg", "video/mpeg"],
  ["3gp", "video/3gpp"],
  ["wmv", "video/x-ms-wmv"],
  ["flv", "video/x-flv"],
  ["f4v", "video/mp4"],
  ["ts", "video/mp2t"],
  ["mts", "video/mp2t"],
  ["m2ts", "video/mp2t"],
  ["rm", "application/vnd.rn-realmedia"],
  ["rmvb", "application/vnd.rn-realmedia-vbr"],
]);

function eagleMime(extension: string, group: string): string {
  const known = EAGLE_MIME.get(extension) ?? GENERIC_MIME.get(extension);
  if (known) return known;
  switch (group) {
    case "rasterImage":
    case "rawImage":
      return `image/x-${extension}`;
    case "video":
      return `video/x-${extension}`;
    case "audio":
      return `audio/x-${extension}`;
    case "font":
      return `font/${extension}`;
    case "model":
      return `model/x-${extension}`;
    case "web":
      return `application/x-${extension}`;
    default:
      return `application/x-${extension}`;
  }
}

function extensionFor(path: string): string {
  const name = path.slice(
    Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1,
  );
  const dot = name.lastIndexOf(".");
  return dot > 0 && dot < name.length - 1
    ? name.slice(dot + 1).toLowerCase()
    : "";
}

export function canDestructivelyEditImage(path: string): boolean {
  return DESTRUCTIVELY_EDITABLE_IMAGE_EXTENSIONS.has(extensionFor(path));
}

function format(
  extension: string,
  mediaType: MediaType,
  mimeType: string,
  previewKind: LibraryPreviewKind,
): LibraryFileFormat {
  return { extension, mediaType, mimeType, previewKind };
}

export function classifyLibraryFile(
  path: string,
  suppliedMimeType?: string | null,
): LibraryFileFormat {
  const extension = extensionFor(path);
  const supplied = suppliedMimeType?.split(";", 1)[0]?.trim().toLowerCase();

  /** `.ts` is both TypeScript and MPEG-TS; importers sniff the header and persist this MIME type. */
  if (extension === "ts" && supplied === "video/mp2t") {
    return format(extension, "video", supplied, "video");
  }

  const directImage = DIRECT_IMAGES.get(extension);
  if (directImage)
    return format(extension, "image", directImage, "direct-image");

  const nativeImage = NATIVE_IMAGES.get(extension);
  if (nativeImage)
    return format(extension, "image", nativeImage, "native-image");

  const video = VIDEOS.get(extension);
  if (video) return format(extension, "video", video, "video");

  const audio = AUDIO.get(extension);
  if (audio) return format(extension, "audio", audio, "audio");

  if (extension === "pdf") {
    return format(extension, "document", "application/pdf", "pdf");
  }

  const font = FONTS.get(extension);
  if (font) return format(extension, "font", font, "font");

  const text = TEXT.get(extension);
  if (text) return format(extension, "text", text, "text");

  const eagleGroup = eagleFormatGroup(extension);
  if (eagleGroup) {
    const mimeType = eagleMime(extension, eagleGroup);
    switch (eagleGroup) {
      case "rasterImage":
      case "rawImage":
      case "design":
        return format(extension, "image", mimeType, "generic");
      case "video":
        return format(extension, "video", mimeType, "generic");
      case "audio":
        return format(extension, "audio", mimeType, "audio");
      case "document":
        return format(extension, "document", mimeType, "generic");
      case "font":
        return format(extension, "font", mimeType, "font");
      case "text":
        return format(extension, "text", mimeType, "text");
      default:
        return format(extension, "file", mimeType, "generic");
    }
  }

  if (supplied?.startsWith("image/")) {
    return format(extension, "image", supplied, "native-image");
  }
  if (supplied?.startsWith("video/")) {
    return format(extension, "video", supplied, "video");
  }
  if (supplied?.startsWith("audio/")) {
    return format(extension, "audio", supplied, "audio");
  }
  if (supplied === "application/pdf") {
    return format(extension, "document", supplied, "pdf");
  }
  if (
    supplied?.startsWith("font/") ||
    supplied?.startsWith("application/font")
  ) {
    return format(extension, "font", supplied, "font");
  }

  return format(
    extension,
    "file",
    supplied || GENERIC_MIME.get(extension) || "application/octet-stream",
    "generic",
  );
}

export function isMpegTransportStreamHeader(header: Uint8Array): boolean {
  const packetSize = 188;
  const lastOffset = Math.min(packetSize, header.byteLength);
  for (let offset = 0; offset < lastOffset; offset += 1) {
    if (
      header[offset] === 0x47 &&
      header[offset + packetSize] === 0x47 &&
      header[offset + packetSize * 2] === 0x47
    ) {
      return true;
    }
  }
  return false;
}

export function classifyLibraryFileFromHeader(
  path: string,
  suppliedMimeType: string | null | undefined,
  header: Uint8Array,
): LibraryFileFormat {
  if (extensionFor(path) === "ts") {
    return isMpegTransportStreamHeader(header)
      ? format("ts", "video", "video/mp2t", "video")
      : format("ts", "text", "text/typescript", "text");
  }
  return classifyLibraryFile(path, suppliedMimeType);
}

/** Device names Windows refuses as file names, with or without an extension. */
const WINDOWS_RESERVED_NAME = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])$/i;

function avoidWindowsReservedName(name: string): string {
  const stem = (name.split(".")[0] ?? "").trimEnd();
  return WINDOWS_RESERVED_NAME.test(stem) ? `_${name}` : name;
}

export function libraryFilename(path: string, fallback = "file.bin"): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const original = path.slice(slash + 1).trim();
  const withoutControls = Array.from(original, (character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127 ? "_" : character;
  }).join("");
  const cleaned = withoutControls
    .replace(/[<>:"/\\|?*]/g, "_")
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "")
    .trim();
  if (!cleaned) return fallback;
  return avoidWindowsReservedName(cleaned).slice(0, 180);
}

export function typeLabelForPath(path: string): string | null {
  const extension = extensionFor(path);
  return extension && /^[a-z0-9]{1,12}$/.test(extension)
    ? extension.toUpperCase()
    : null;
}

export function requiresGeneratedImagePreview(path: string): boolean {
  return classifyLibraryFile(path).previewKind === "native-image";
}

export function canRequestNativeThumbnail(path: string): boolean {
  const kind = classifyLibraryFile(path).previewKind;
  return (
    kind === "native-image" ||
    kind === "audio" ||
    kind === "pdf" ||
    kind === "font" ||
    kind === "generic"
  );
}
