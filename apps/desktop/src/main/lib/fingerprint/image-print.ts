import { dhashFromGray, sampleDhashGrid } from "./dhash";
import type { GrayImage } from "./dhash";

export const IMAGE_PRINT_ALGORITHM = "image-dhash";
export const IMAGE_PRINT_VERSION = 1;
/** Side of the greyscale square the image is decoded into before the grids are sampled. */
export const IMAGE_PRINT_DECODE_SIZE = 256;
const CENTER_INSET = 0.1;

export interface ImagePrint {
  full: bigint;
  /** The middle 80%, so a screenshot with a border or a light crop still lines up. */
  center: bigint;
}

export function imagePrintFromGray(image: GrayImage): ImagePrint {
  const insetX = image.width * CENTER_INSET;
  const insetY = image.height * CENTER_INSET;
  return {
    full: dhashFromGray(sampleDhashGrid(image)),
    center: dhashFromGray(
      sampleDhashGrid(image, {
        left: insetX,
        top: insetY,
        right: image.width - insetX,
        bottom: image.height - insetY,
      }),
    ),
  };
}

export function encodeImagePrint(print: ImagePrint): Uint8Array {
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, print.full);
  view.setBigUint64(8, print.center);
  return bytes;
}

export function decodeImagePrint(bytes: Uint8Array): ImagePrint | null {
  if (bytes.byteLength !== 16) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { full: view.getBigUint64(0), center: view.getBigUint64(8) };
}
