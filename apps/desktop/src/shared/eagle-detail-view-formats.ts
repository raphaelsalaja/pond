/**
 * Detail-view families observed in Eagle 4.0.0 build 23 against the 2026-09-27 format gallery.
 * @remarks Empirical viewer routing, not Eagle's official import manifest.
 */
export const EAGLE_DETAIL_VIEW_FORMATS = {
  standardVisualCanvas: [
    "avif",
    "bmp",
    "gif",
    "heic",
    "heif",
    "hif",
    "insp",
    "jfif",
    "jpe",
    "jpeg",
    "jpg",
    "png",
    "svg",
    "tga",
    "tif",
    "tiff",
    "webp",
  ],
  nativePreview: [
    "af",
    "afphoto",
    "afpub",
    "ai",
    "blend",
    "c4d",
    "cdr",
    "clip",
    "dds",
    "doc",
    "docx",
    "dwg",
    "fig",
    "graffle",
    "ico",
    "key",
    "mindnode",
    "numbers",
    "pages",
    "potx",
    "ppt",
    "pptx",
    "psb",
    "psd",
    "psdt",
    "pxd",
    "skp",
    "xd",
    "xls",
    "xlsx",
    "xmind",
  ],
  cameraRaw: [
    "3fr",
    "arw",
    "cr2",
    "cr3",
    "crw",
    "dng",
    "erf",
    "mrw",
    "nef",
    "nrw",
    "orf",
    "pef",
    "raf",
    "raw",
    "rw2",
    "sr2",
    "srw",
    "x3f",
  ],
  codeEditor: [
    "css",
    "java",
    "js",
    "py",
    "rs",
    "sql",
    "ts",
    "xml",
    "yaml",
    "yml",
  ],
  dotLottieJson: ["json"],
  textEditor: ["txt"],
  inlineWeb: ["html", "mhtml"],
  pdf: ["pdf"],
  audio: ["aac", "flac", "m4a", "mp3", "ogg", "wav"],
  fullVideo: [
    "360",
    "3gp",
    "afx",
    "eva",
    "f4v",
    "mkv",
    "mov",
    "mp4",
    "vap",
    "webm",
  ],
  frameSteppingVideo: ["m4v", "mpg", "mts", "wmv"],
  alternateMedia: ["avi", "flv", "m2ts"],
  font: ["otf", "ttc", "ttf", "woff"],
  model: [
    "3dm",
    "3ds",
    "3mf",
    "amf",
    "dae",
    "fbx",
    "glb",
    "gltf",
    "ifc",
    "obj",
    "ply",
    "spline",
    "splinecode",
    "stl",
    "usdc",
    "usdz",
    "vtk",
  ],
  dedicatedImagePlugin: ["exr", "hdr", "icns", "jxl"],
  previewOnly: [
    "afdesign",
    "ait",
    "eddx",
    "emmx",
    "idml",
    "indd",
    "indt",
    "number",
    "prd",
    "sketch",
    "skt",
  ],
  noPreview: ["url"],
} as const;

export type EagleDetailViewFamily = keyof typeof EAGLE_DETAIL_VIEW_FORMATS;

export const EAGLE_DETAIL_VIEW_EXTENSIONS: ReadonlySet<string> = new Set(
  Object.values(EAGLE_DETAIL_VIEW_FORMATS).flat(),
);

const DETAIL_VIEW_FAMILY_BY_EXTENSION = new Map<
  string,
  EagleDetailViewFamily
>();

for (const family of Object.keys(EAGLE_DETAIL_VIEW_FORMATS)) {
  if (!isEagleDetailViewFamily(family)) continue;
  for (const extension of EAGLE_DETAIL_VIEW_FORMATS[family]) {
    DETAIL_VIEW_FAMILY_BY_EXTENSION.set(extension, family);
  }
}

function isEagleDetailViewFamily(
  value: string,
): value is EagleDetailViewFamily {
  return Object.hasOwn(EAGLE_DETAIL_VIEW_FORMATS, value);
}

export function eagleDetailViewFamily(
  extension: string,
): EagleDetailViewFamily | null {
  return DETAIL_VIEW_FAMILY_BY_EXTENSION.get(extension.toLowerCase()) ?? null;
}
