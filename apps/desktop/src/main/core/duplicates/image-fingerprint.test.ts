import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { hamming64 } from "../../lib/fingerprint/bits";
import {
  decodeImagePrint,
  type ImagePrint,
} from "../../lib/fingerprint/image-print";
import { matchLibrary } from "./engine";
import { imageFingerprint } from "./fingerprint-compute";
import { IMAGE_CENTER_DISTANCE, IMAGE_FULL_DISTANCE } from "./matchers/image";
import type { LibrarySave } from "./types";

const WIDTH = 640;
const HEIGHT = 480;

function scenePixels(invert = false): Buffer {
  const pixels = Buffer.alloc(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const u = x / WIDTH;
      const v = y / HEIGHT;
      const value =
        128 +
        55 * Math.sin(2 * Math.PI * (u * 2.3 + 0.2)) +
        40 * Math.cos(2 * Math.PI * (v * 1.7 + u * 0.9)) +
        20 * Math.sin(2 * Math.PI * (u + v) * 3.1);
      pixels[y * WIDTH + x] = invert ? 255 - value : value;
    }
  }
  return pixels;
}

function raw(pixels: Buffer, width = WIDTH, height = HEIGHT) {
  return sharp(pixels, { raw: { width, height, channels: 1 } });
}

async function printOf(image: Buffer): Promise<ImagePrint> {
  const outcome = await imageFingerprint(image);
  expect(outcome.status).toBe("ok");
  const print = outcome.value ? decodeImagePrint(outcome.value) : null;
  if (!print) throw new Error("No print");
  return print;
}

const images: Record<string, Buffer> = {};
const prints: Record<string, ImagePrint> = {};

beforeAll(async () => {
  const scene = scenePixels();
  images.original = await raw(scene).png().toBuffer();
  images.resized = await raw(scene).resize(320, 240).png().toBuffer();
  images.jpeg = await raw(scene).jpeg({ quality: 45 }).toBuffer();
  images.rotated = await sharp(await raw(scene).rotate(270).png().toBuffer())
    .jpeg({ quality: 90 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  images.bordered = await raw(scene)
    .extend({
      left: WIDTH / 8,
      right: WIDTH / 8,
      top: HEIGHT / 8,
      bottom: HEIGHT / 8,
      background: "#ffffff",
    })
    .png()
    .toBuffer();
  images.inverted = await raw(scenePixels(true)).png().toBuffer();
  for (const [name, image] of Object.entries(images))
    prints[name] = await printOf(image);
});

function print(name: string): ImagePrint {
  const found = prints[name];
  if (!found) throw new Error(`No print for ${name}`);
  return found;
}

describe("image fingerprints", () => {
  it("survives resizing, re-encoding and EXIF rotation", () => {
    const original = print("original");
    for (const name of ["resized", "jpeg", "rotated"])
      expect(hamming64(print(name).full, original.full)).toBeLessThanOrEqual(
        IMAGE_FULL_DISTANCE,
      );
  });

  it("lines up a bordered copy through its center print", () => {
    expect(
      hamming64(print("bordered").center, print("original").full),
    ).toBeLessThanOrEqual(IMAGE_CENTER_DISTANCE);
  });

  it("keeps a different image far away", () => {
    expect(
      hamming64(print("inverted").full, print("original").full),
    ).toBeGreaterThan(IMAGE_FULL_DISTANCE * 4);
  });

  it("refuses flat images", async () => {
    const flat = await raw(Buffer.alloc(WIDTH * HEIGHT, 120))
      .png()
      .toBuffer();
    expect((await imageFingerprint(flat)).status).toBe("low-detail");
  });

  it("matches the copies and leaves the different image out", async () => {
    const names = ["original", "resized", "bordered", "inverted"];
    const sha = (index: number) => String(index + 1).padEnd(64, "0");
    const saves: LibrarySave[] = names.map((name, index) => ({
      id: name,
      source: "local",
      sourceId: "",
      url: "",
      captureUrl: null,
      splitSourceId: null,
      clip: null,
      assets: [
        {
          saveId: name,
          path: `${name}.png`,
          kind: "image",
          size: 1,
          sha256: sha(index),
          media: "image",
        },
      ],
    }));
    const image = new Map<string, Uint8Array>();
    for (const [index, name] of names.entries()) {
      const file = images[name];
      if (!file) throw new Error(`No ${name} image`);
      const outcome = await imageFingerprint(file);
      if (outcome.value) image.set(sha(index), outcome.value);
    }
    const { pairs } = matchLibrary(saves, {
      classifyUrl: () => null,
      fingerprints: { image, video: new Map(), audio: new Map() },
    });
    const ids = pairs.map((pair) => pair.ids.join("+"));
    expect(ids).toContain("original+resized");
    expect(ids).toContain("bordered+original");
    expect(ids.some((id) => id.includes("inverted"))).toBe(false);
    expect(pairs.every((pair) => pair.relation === "near")).toBe(true);
  });
});
