import type { Transaction } from "@pond/schema/tx";
import sharp from "sharp";
import { expect, it } from "vitest";
import {
  compressExistingImages,
  encodeCompressedImage,
} from "./image-compression";

it("supports lossless PNG and WebP compression without changing dimensions", async () => {
  const source = await sharp({
    create: {
      width: 64,
      height: 32,
      channels: 4,
      background: { r: 100, g: 50, b: 25, alpha: 1 },
    },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  const png = await encodeCompressedImage(source, "image.png", "lossless", 85);
  const webp = await encodeCompressedImage(
    source,
    "image.webp",
    "lossless",
    85,
  );
  expect(png).not.toBeNull();
  expect(webp).not.toBeNull();
  if (!png || !webp) {
    throw new Error("Expected compressed image bytes.");
  }
  expect(await sharp(png).metadata()).toMatchObject({
    width: 64,
    height: 32,
    format: "png",
  });
  expect(await sharp(webp).metadata()).toMatchObject({
    width: 64,
    height: 32,
    format: "webp",
  });
});

it("uses quality mode for JPEG and refuses to label it lossless", async () => {
  const source = await sharp({
    create: {
      width: 40,
      height: 20,
      channels: 3,
      background: "red",
    },
  })
    .jpeg({ quality: 100 })
    .toBuffer();
  expect(
    await encodeCompressedImage(source, "image.jpg", "lossless", 80),
  ).toBeNull();
  const compressed = await encodeCompressedImage(
    source,
    "image.jpg",
    "quality",
    60,
  );
  if (!compressed) {
    throw new Error("Expected compressed JPEG bytes.");
  }
  expect(await sharp(compressed).metadata()).toMatchObject({
    width: 40,
    height: 20,
    format: "jpeg",
  });
});

it("converts image bytes to WebP for in-place replacement", async () => {
  const source = await sharp({
    create: {
      width: 40,
      height: 20,
      channels: 3,
      background: "red",
    },
  })
    .png()
    .toBuffer();
  const converted = await encodeCompressedImage(
    source,
    "image.png",
    "webp",
    85,
  );
  if (!converted) {
    throw new Error("Expected converted WebP bytes.");
  }
  expect(await sharp(converted).metadata()).toMatchObject({
    width: 40,
    height: 20,
    format: "webp",
  });
});

it("losslessly removes SVG comments and leaves quality mode unsupported", async () => {
  const source = Buffer.from(
    '<?xml version="1.0"?>\r\n<!-- metadata --><svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>\r\n',
  );
  const compressed = await encodeCompressedImage(
    source,
    "image.svg",
    "lossless",
    85,
  );
  expect(compressed?.toString()).not.toContain("metadata");
  expect(
    await encodeCompressedImage(source, "image.svg", "quality", 50),
  ).toBeNull();
});

it("commits replacement bytes, metadata, derived images, and Undo as one batch", async () => {
  const source = await sharp({
    create: {
      width: 100,
      height: 50,
      channels: 4,
      background: { r: 20, g: 40, b: 60, alpha: 1 },
    },
  })
    .png({ compressionLevel: 0 })
    .toBuffer();
  const thumbnail = await sharp(source).resize(20, 10).png().toBuffer();
  const committed: Array<Array<Transaction>> = [];
  const undo: Array<Array<Transaction>> = [];
  const result = await compressExistingImages(
    {
      ids: ["save"],
      fileIndex: 0,
      mode: "lossless",
      quality: 85,
      signal: new AbortController().signal,
    },
    {
      async load() {
        return [
          {
            save: {
              id: "save",
              files: [
                {
                  kind: "image",
                  path: "image.png",
                  sha256: "old-image",
                  size: source.length,
                  mimeType: "image/png",
                  width: 100,
                  height: 50,
                },
                {
                  kind: "thumbnail",
                  path: "image.png_thumbnail.png",
                  sha256: "old-thumbnail",
                  size: thumbnail.length,
                  mimeType: "image/png",
                  width: 20,
                  height: 10,
                },
              ],
              width: 100,
              height: 50,
              dominantColors: [],
              blurhash: null,
            },
            file: {
              kind: "image",
              path: "image.png",
              sha256: "old-image",
              size: source.length,
              mimeType: "image/png",
              width: 100,
              height: 50,
            },
            source,
            thumbnail: {
              file: {
                kind: "thumbnail",
                path: "image.png_thumbnail.png",
                sha256: "old-thumbnail",
                size: thumbnail.length,
                mimeType: "image/png",
                width: 20,
                height: 10,
              },
              source: thumbnail,
            },
          },
        ];
      },
      async commit(transactions) {
        committed.push(transactions);
      },
      recordUndo(transactions) {
        undo.push(transactions);
      },
    },
  );
  expect(result).toMatchObject({ changed: 1, skipped: 0 });
  expect(result.bytesAfter).toBeLessThan(result.bytesBefore);
  expect(committed).toHaveLength(1);
  expect(undo).toEqual(committed);
  expect(committed[0]?.[0]).toMatchObject({
    patch: {
      width: 100,
      height: 50,
    },
    files: [
      { filename: "image.png" },
      { filename: "image.png_thumbnail.webp" },
    ],
    fileRenames: [
      {
        from: "image.png_thumbnail.png",
        to: "image.png_thumbnail.webp",
      },
    ],
    beforeFiles: [
      { filename: "image.png", bytes: source },
      { filename: "image.png_thumbnail.png", bytes: thumbnail },
    ],
  });
});
