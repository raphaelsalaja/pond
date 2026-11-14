import { isCombinableImage } from "./combine-images-layout";
import {
  isAuxiliaryKind,
  isPostRenderKind,
  POST_RENDER_DARK_KIND,
  POST_RENDER_LIGHT_KIND,
} from "./save-file-names";

export interface CombineSourceFile {
  kind: string;
  path: string;
  mimeType?: string | null;
}

export interface CombineImageCover {
  tweetCover?: "media" | "screenshot";
  theme?: "light" | "dark";
}

/** `files[0]` can be a post card, avatar, or quoted-post card, so Post Cover picks the media or the theme-matched card. */
export function pickCombineImageFile<T extends CombineSourceFile>(
  files: readonly T[],
  cover: CombineImageCover = {},
): T | null {
  const tweetCover = cover.tweetCover ?? "media";
  const theme = cover.theme ?? "light";
  const card = themeCard(files, theme);
  if (tweetCover === "screenshot" && card && combinable(card)) return card;

  const media = files.find(
    (file) =>
      combinable(file) &&
      !isAuxiliaryKind(file.kind) &&
      !isPostRenderKind(file.kind),
  );
  if (media) return media;
  return card && combinable(card) ? card : null;
}

function combinable(file: CombineSourceFile): boolean {
  return isCombinableImage(file.mimeType, file.path);
}

function themeCard<T extends CombineSourceFile>(
  files: readonly T[],
  theme: "light" | "dark",
): T | null {
  const preferred =
    theme === "dark" ? POST_RENDER_DARK_KIND : POST_RENDER_LIGHT_KIND;
  const other =
    theme === "dark" ? POST_RENDER_LIGHT_KIND : POST_RENDER_DARK_KIND;
  return (
    files.find((file) => file.kind === preferred) ??
    files.find((file) => file.kind === other) ??
    null
  );
}
