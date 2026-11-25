import type { Save, SaveFile } from "@pond/schema/db";
import { pickCardFile } from "@shared/save-file-names";
import { encode } from "blurhash";
import sharp from "sharp";
import { isStaticThumbnailFile } from "../../shared/media-index";

const ENCODE_SIZE = 32;

export function pickBlurhashStill(
  save: Pick<Save, "files" | "coverIndex">,
): SaveFile | null {
  const files = save.files ?? [];
  const card = pickCardFile(files);
  const still =
    (card && isStaticThumbnailFile(card) ? card : null) ??
    files.find(
      (file) => file.kind === "poster" && isStaticThumbnailFile(file),
    ) ??
    files.find((file) => isStaticThumbnailFile(file)) ??
    null;
  return still;
}

export async function encodeBlurhash(
  input: string | Buffer,
): Promise<string | null> {
  try {
    const decodePixels = (source: string | Buffer) =>
      sharp(source, { failOn: "none", pages: 1 })
        .rotate()
        .ensureAlpha()
        .resize(ENCODE_SIZE, ENCODE_SIZE, { fit: "inside" })
        .raw()
        .toBuffer({ resolveWithObject: true });
    const { data, info } = await decodePixels(input);
    if (info.channels !== 4 || info.width < 1 || info.height < 1) return null;
    return encode(
      new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength),
      info.width,
      info.height,
      4,
      3,
    );
  } catch {
    return null;
  }
}
