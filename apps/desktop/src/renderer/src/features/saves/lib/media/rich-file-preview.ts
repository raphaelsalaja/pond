import { classifyLibraryFile } from "@shared/file-format";
import type { SaveFile } from "@/features/saves/types";

export type RichFilePreviewKind = "model" | "epub" | "font" | "archive";

const CARD_MODELS = new Set([
  "glb",
  "fbx",
  "obj",
  "3ds",
  "3mf",
  "dae",
  "ply",
  "stl",
]);

export function richFilePreviewKind(
  file: SaveFile | null,
): RichFilePreviewKind | null {
  if (!file) return null;
  const format = classifyLibraryFile(file.path, file.mimeType);
  if (CARD_MODELS.has(format.extension)) return "model";
  if (format.extension === "epub") return "epub";
  if (format.previewKind === "font") return "font";
  if (["zip", "rar", "7z"].includes(format.extension)) return "archive";
  return null;
}
