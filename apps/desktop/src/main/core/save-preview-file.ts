import { existsSync } from "node:fs";
import { basename, extname } from "node:path";
import type { ApiThumbnailSize } from "@pond/schema/api";
import type { SaveFile } from "@pond/schema/db";
import { pickCardFile } from "@shared/save-file-names";
import { PondError } from "../lib/pond-error";
import { saveFile } from "../paths";
import { getOrCreateThumbnail } from "./thumbnail";

const IMAGE_TYPES = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
]);

const THUMBNAIL_WIDTHS = { small: 160, medium: 480, large: 1024 } as const;

function noThumbnail(): never {
  throw new PondError("no_thumbnail", "This Save has no image to show.");
}

export async function savePreviewFile(
  id: string,
  files: Array<SaveFile>,
  size: ApiThumbnailSize,
): Promise<{ path: string; type: string }> {
  const cover = pickCardFile(files);
  if (!cover) {
    noThumbnail();
  }
  /** File names come from our own DB, but basename() keeps a corrupted row from escaping the Save directory. */
  const path = saveFile(id, basename(cover.path));
  if (!existsSync(path)) {
    noThumbnail();
  }
  if (size === "original") {
    const type =
      cover.mimeType?.startsWith("image/") === true
        ? cover.mimeType
        : IMAGE_TYPES.get(extname(cover.path).toLowerCase());
    if (!type) {
      noThumbnail();
    }
    return { path, type };
  }
  const thumb = await getOrCreateThumbnail({
    saveId: id,
    sourcePath: path,
    width: THUMBNAIL_WIDTHS[size],
    version: null,
  });
  if (!thumb) {
    noThumbnail();
  }
  return { path: thumb.path, type: "image/webp" };
}
