import sharp from "sharp";
import {
  DHASH_HEIGHT,
  DHASH_WIDTH,
  dhashFromGray,
  hashToHex,
} from "./fingerprint/dhash";
import { decodeHeicOnMacIfNeeded } from "./heic";

export async function encodePhash(
  source: string | Buffer,
): Promise<string | null> {
  try {
    const decoded = await decodeHeicOnMacIfNeeded(source, 64);
    const pixels = await sharp(decoded ?? source)
      .resize(DHASH_WIDTH, DHASH_HEIGHT, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer();
    return hashToHex(dhashFromGray(pixels));
  } catch {
    return null;
  }
}
