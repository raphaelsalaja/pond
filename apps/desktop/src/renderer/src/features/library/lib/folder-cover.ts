import {
  isTextCardThumbnailPath,
  isThumbnailKind,
} from "@shared/save-file-names";
import {
  buildPondUrl,
  pickCardUnit,
  previewThumbUrlFor,
  thumbUrlFor,
} from "@/features/saves/media";
import type { Save, SaveFile } from "@/features/saves/types";
import { resolveCurrentTheme } from "@/shared/hooks/use-resolved-theme";
import type { ResolvedTheme } from "@/shared/hooks/use-resolved-theme";

/** Card units skip this file so a text save can draw its own preview. */
function textCoverFile(save: Save, theme: ResolvedTheme): SaveFile | null {
  const files = (save.files ?? []).filter(
    (file) => isThumbnailKind(file.kind) && isTextCardThumbnailPath(file.path),
  );
  if (files.length === 0) {
    return null;
  }
  const preferred =
    theme === "dark"
      ? ["thumbnail-dark.png", "thumbnail.webp", "thumbnail.png"]
      : ["thumbnail.webp", "thumbnail.png", "thumbnail-dark.png"];
  for (const filename of preferred) {
    const match = files.find((file) => file.path.endsWith(filename));
    if (match) {
      return match;
    }
  }
  return files[0] ?? null;
}

export function folderCoverUrl(
  save: Save,
  width = 36,
  theme = resolveCurrentTheme(),
): string | null {
  const unit = pickCardUnit(save, { theme });
  if (unit) {
    return unit.requiresGeneratedPreview
      ? previewThumbUrlFor(unit.url, width)
      : thumbUrlFor(unit.url, width);
  }
  const cover = textCoverFile(save, theme);
  return cover ? thumbUrlFor(buildPondUrl(save.id, cover), width) : null;
}
