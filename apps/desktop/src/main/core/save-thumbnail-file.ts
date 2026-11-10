import {
  hasMediaThumbnail,
  isAuxiliaryKind,
  isOriginalImageKind,
  isPostRenderKind,
  POSTER_KIND,
  THUMBNAIL_DARK_KIND,
  THUMBNAIL_KIND,
} from "@shared/save-file-names";
import sharp from "sharp";

const MAX_EDGE = 1024;

export async function renderThumbnail(
  input: string | Buffer,
): Promise<Buffer | null> {
  try {
    return await sharp(input, { failOn: "none", pages: 1 })
      .rotate()
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer();
  } catch {
    return null;
  }
}

interface ThumbnailInput {
  kind: string;
  path: string;
  custom?: boolean | null;
}

export function thumbnailSource(
  files: readonly { kind: string; path: string }[],
): { kind: string; path: string } | undefined {
  return (
    files.find((file) => file.kind === POSTER_KIND) ??
    files.find((file) => isOriginalImageKind(file.kind)) ??
    files.find(
      (file) => !isAuxiliaryKind(file.kind) && !isPostRenderKind(file.kind),
    )
  );
}

/** Out of 64 bits; a resized copy of the same image lands under 10, an unrelated image near 32. */
const THUMBNAIL_MISMATCH_BITS = 20;

async function differenceHash(input: string | Buffer): Promise<bigint | null> {
  try {
    const pixels = await sharp(input, { failOn: "none", pages: 1 })
      .rotate()
      .greyscale()
      .resize(9, 8, { fit: "fill" })
      .raw()
      .toBuffer();
    let hash = 0n;
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 8; column += 1) {
        const left = pixels[row * 9 + column] ?? 0;
        const right = pixels[row * 9 + column + 1] ?? 0;
        hash = (hash << 1n) | (left > right ? 1n : 0n);
      }
    }
    return hash;
  } catch {
    return null;
  }
}

function hammingDistance(a: bigint, b: bigint): number {
  let value = a ^ b;
  let count = 0;
  while (value > 0n) {
    count += Number(value & 1n);
    value >>= 1n;
  }
  return count;
}

export async function thumbnailLooksLikeSource(
  thumbnail: Buffer,
  source: Buffer,
): Promise<boolean | null> {
  const [left, right] = await Promise.all([
    differenceHash(thumbnail),
    differenceHash(source),
  ]);
  if (left === null || right === null) return null;
  return hammingDistance(left, right) <= THUMBNAIL_MISMATCH_BITS;
}

export function planThumbnailRepair(
  files: readonly ThumbnailInput[],
  matchesSource: boolean | null,
): "keep" | "create" | "rebuild" {
  if (hasCustomThumbnail(files)) return "keep";
  if (!thumbnailSource(files)) return "keep";
  if (!hasMediaThumbnail(files)) return "create";
  if (matchesSource === false) return "rebuild";
  return "keep";
}

function hasCustomThumbnail(files: readonly ThumbnailInput[]): boolean {
  return files.some(
    (file) =>
      (file.kind === THUMBNAIL_KIND || file.kind === THUMBNAIL_DARK_KIND) &&
      file.custom === true,
  );
}

/** The file a new thumbnail renders from; a thumbnail you picked is never replaced, even when forced. */
export function thumbnailToRender(
  files: readonly ThumbnailInput[],
  force: boolean,
): { kind: string; path: string } | undefined {
  if (hasCustomThumbnail(files)) return undefined;
  if (!force && hasMediaThumbnail(files)) return undefined;
  return thumbnailSource(files);
}
