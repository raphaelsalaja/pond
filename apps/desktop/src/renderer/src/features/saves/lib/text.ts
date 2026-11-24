import {
  isAuxiliaryKind,
  isOriginalImageKind,
  isPostRenderKind,
} from "@shared/save-file-names";
import {
  arenaBlockClassFromRawJson,
  textBodyFromFields,
} from "@shared/text-card";
import { composeContentDescription } from "@/features/saves/lib/content-description";
import { hasArchive, isArchiveFile } from "@/features/saves/lib/media/archive";
import type { Save, SaveFile } from "@/features/saves/types";

export function textBodyForSave(save: Save): string {
  const fromDescription = composeContentDescription(save).trim();
  if (fromDescription) {
    return fromDescription;
  }
  if (save.mediaType?.toLowerCase() === "text") {
    return textBodyFromFields(null, save.title) || "Untitled";
  }
  return "";
}

export function noteBodyForSave(save: Save): string {
  return save.description?.trim() ?? "";
}

export function displayTitleForSave(save: Save): string {
  const title = save.title?.trim();
  if (title) {
    return title;
  }
  if (save.mediaType?.toLowerCase() === "text") {
    return "Untitled";
  }
  return save.url;
}

export function arenaBlockClass(save: Save): string | null {
  return arenaBlockClassFromRawJson(save.rawJson);
}

function isMediaFile(file: SaveFile): boolean {
  if (isAuxiliaryKind(file.kind)) {
    return false;
  }
  if (file.kind === "video" || isOriginalImageKind(file.kind)) {
    return true;
  }
  if (file.mimeType?.startsWith("video/") === true) {
    return true;
  }
  if (file.mimeType?.startsWith("image/") === true) {
    return true;
  }
  const ext = file.path.split(".").pop()?.toLowerCase() ?? "";
  if (/^(png|jpe?g|gif|webp|avif|heic|heif|svg|bmp|tiff?|ico)$/.test(ext)) {
    return true;
  }
  return /^(mp4|webm|mov|m4v|mkv)$/i.test(ext);
}

export function isTextOnlyAsideFromCover(save: Save): boolean {
  return !(save.files ?? []).some(
    (f) => !isAuxiliaryKind(f.kind) && !isArchiveFile(f) && isMediaFile(f),
  );
}

export function isTextOnlySave(save: Save): boolean {
  if (save.source === "twitter" || save.source === "threads") {
    return false;
  }
  if ((save.files ?? []).some((f) => isPostRenderKind(f.kind))) {
    return false;
  }
  if (hasArchive(save)) {
    return false;
  }
  if (!isTextOnlyAsideFromCover(save)) {
    return false;
  }
  if (save.mediaType?.toLowerCase() === "text") {
    return true;
  }
  return Boolean(textBodyForSave(save));
}
