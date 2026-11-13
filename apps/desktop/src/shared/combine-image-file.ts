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

/**
 * The file Combine Images should show for one Save.
 *
 * `files[0]` is not that file. Capture writes the X/Threads card PNGs before
 * media, so the first file is the screenshot. Replacing a card appends the new
 * PNG, which slides an avatar or a quoted-post card into index 0. Post Cover
 * chooses the original media, and the card PNG only when the post has none.
 */
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
