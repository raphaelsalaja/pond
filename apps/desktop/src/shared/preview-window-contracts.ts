import type { SaveFile } from "@pond/schema/db";
import { z } from "zod";
import { canRequestNativeThumbnail, classifyLibraryFile } from "./file-format";
import type { CancellableResult } from "./query-contracts-shared";
import { isAuxiliaryKind } from "./save-file-names";

const PreviewWindowKindSchema = z.enum(["presentation", "detached"]);

export const PreviewWindowOpenSchema = z.object({
  saveId: z.string().min(1),
  fileIndex: z.number().int().nonnegative().default(0),
  kind: PreviewWindowKindSchema,
});
export type PreviewWindowOpen = z.infer<typeof PreviewWindowOpenSchema>;

export const PreviewWindowConfigureSchema = z.object({
  windowId: z.number().int().positive(),
  opacity: z.number().min(0.2).max(1).optional(),
  alwaysOnTop: z.boolean().optional(),
  fullscreen: z.boolean().optional(),
  rotation: z
    .union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)])
    .optional(),
  mirrored: z.boolean().optional(),
  grayscale: z.boolean().optional(),
  size: z.enum(["fit", "actual", "fill"]).optional(),
  zoom: z.number().min(0.05).max(8).nullable().optional(),
  videoMuted: z.boolean().optional(),
});
export type PreviewWindowConfigure = z.infer<
  typeof PreviewWindowConfigureSchema
>;

export const PreviewWindowNavigateSchema = z.object({
  windowId: z.number().int().positive(),
  saveId: z.string().min(1),
  fileIndex: z.number().int().nonnegative(),
});
export type PreviewWindowNavigate = z.infer<typeof PreviewWindowNavigateSchema>;

export const PreviewNeighborRequestSchema = z.object({
  windowId: z.number().int().positive(),
  saveId: z.string().min(1),
  delta: z.union([z.literal(-1), z.literal(1)]),
  kind: PreviewWindowKindSchema.default("presentation"),
});
export type PreviewNeighborRequest = z.infer<
  typeof PreviewNeighborRequestSchema
>;

export const PreviewFileActionSchema = z.object({
  windowId: z.number().int().positive(),
  action: z.enum(["open", "export"]),
});
export type PreviewFileAction = z.infer<typeof PreviewFileActionSchema>;

export type PreviewFileActionResult = CancellableResult;

export const PreviewWindowStateSchema = z.object({
  windowId: z.number().int().positive(),
  saveId: z.string().min(1),
  fileIndex: z.number().int().nonnegative(),
  kind: PreviewWindowKindSchema,
  title: z.string(),
  reduceMotion: z.enum(["system", "always", "never"]),
  url: z.string(),
  originalPath: z.string().min(1),
  mediaType: z.enum(["image", "video"]),
  source: z.enum(["original", "generated"]),
  fullscreen: z.boolean(),
  opacity: z.number().min(0.2).max(1),
  alwaysOnTop: z.boolean(),
  rotation: z.union([
    z.literal(0),
    z.literal(90),
    z.literal(180),
    z.literal(270),
  ]),
  mirrored: z.boolean(),
  grayscale: z.boolean(),
  size: z.enum(["fit", "actual", "fill"]),
  zoom: z.number().min(0.05).max(8).nullable(),
  videoMuted: z.boolean(),
});
export type PreviewWindowState = z.infer<typeof PreviewWindowStateSchema>;

export interface PreviewWindowOpenResult {
  windowId: number;
}

export interface PreviewMediaProfile {
  mediaType: PreviewWindowState["mediaType"];
  source: PreviewWindowState["source"];
}

const DETACHED_SPECIALIST_EXTENSIONS = new Set([
  "3ds",
  "3mf",
  "7z",
  "amf",
  "dae",
  "epub",
  "fbx",
  "glb",
  "gltf",
  "html",
  "livp",
  "lottie",
  "mht",
  "mhtml",
  "obj",
  "ply",
  "rar",
  "stl",
  "usdc",
  "usdz",
  "vtk",
  "zip",
]);

export function previewMediaProfile(
  file: Pick<SaveFile, "kind" | "path" | "mimeType">,
): PreviewMediaProfile | null {
  if (isAuxiliaryKind(file.kind)) return null;
  const format = classifyLibraryFile(file.path, file.mimeType);

  switch (format.previewKind) {
    case "direct-image":
      return { mediaType: "image", source: "original" };
    case "native-image":
      return { mediaType: "image", source: "generated" };
    case "video":
      return { mediaType: "video", source: "original" };
    case "audio":
    case "font":
    case "pdf":
    case "text":
      return null;
  }

  if (format.mediaType === "video") {
    return { mediaType: "video", source: "original" };
  }
  if (
    DETACHED_SPECIALIST_EXTENSIONS.has(format.extension) ||
    format.mimeType === "application/octet-stream" ||
    !canRequestNativeThumbnail(file.path)
  ) {
    return null;
  }
  return { mediaType: "image", source: "generated" };
}

export function previewMediaType(
  file: Pick<SaveFile, "kind" | "path" | "mimeType">,
): PreviewWindowState["mediaType"] | null {
  return previewMediaProfile(file)?.mediaType ?? null;
}
