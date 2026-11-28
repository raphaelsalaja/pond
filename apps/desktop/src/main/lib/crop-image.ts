import type { ImageCrop } from "@pond/schema/db";
import sharp from "sharp";
import { decodeHeicOnMacIfNeeded } from "./heic";

export async function cropImage(
  source: string | Buffer,
  crop: ImageCrop,
  frameIndex = 0,
): Promise<Buffer> {
  if (
    ![crop.x, crop.y, crop.w, crop.h].every(Number.isFinite) ||
    crop.x < 0 ||
    crop.y < 0 ||
    crop.w <= 0 ||
    crop.h <= 0 ||
    crop.x + crop.w > 1.000001 ||
    crop.y + crop.h > 1.000001
  ) {
    throw new Error("Select a crop inside the image.");
  }
  const decoded = await decodeHeicOnMacIfNeeded(source);
  const { data, info } = await sharp(decoded ?? source, {
    pages: 1,
    page: frameIndex,
  })
    .autoOrient()
    .toBuffer({ resolveWithObject: true });
  const left = Math.min(info.width - 1, Math.floor(crop.x * info.width));
  const top = Math.min(info.height - 1, Math.floor(crop.y * info.height));
  const width = Math.max(
    1,
    Math.min(info.width - left, Math.round(crop.w * info.width)),
  );
  const height = Math.max(
    1,
    Math.min(info.height - top, Math.round(crop.h * info.height)),
  );
  return sharp(data).extract({ left, top, width, height }).png().toBuffer();
}
