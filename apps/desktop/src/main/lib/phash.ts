import sharp from "sharp";
import {
  DHASH_HEIGHT,
  DHASH_WIDTH,
  dhashFromGray,
  hashToHex,
} from "./fingerprint/dhash";

export async function encodePhash(
  source: string | Buffer,
): Promise<string | null> {
  try {
    const pixels = await sharp(source)
      .resize(DHASH_WIDTH, DHASH_HEIGHT, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer();
    return hashToHex(dhashFromGray(pixels));
  } catch {
    return null;
  }
}
