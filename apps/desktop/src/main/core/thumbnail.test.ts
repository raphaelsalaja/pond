import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { invalidatePaths, resolvePaths, thumbnailCacheRoot } from "../paths";
import { resolveCardThumbnail } from "./thumbnail";

/** Sharp's cache holds input files open, which blocks temp cleanup on Windows. */
sharp.cache(false);

const rotatedHeicFixture = fileURLToPath(
  new URL("../../../test/fixtures/quadrant.heic", import.meta.url),
);

function nearChannel(
  actual: Array<number | undefined>,
  expected: Array<number>,
): boolean {
  return actual.every(
    (channel, index) => Math.abs((channel ?? 0) - (expected[index] ?? 0)) < 50,
  );
}

const paths = { root: "" };

beforeEach(async () => {
  paths.root = await mkdtemp(join(tmpdir(), "pond-card-thumbnail-"));
  resolvePaths(paths.root);
});

afterEach(async () => {
  await rm(thumbnailCacheRoot(), {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  });
  invalidatePaths();
  await rm(paths.root, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 50,
  });
});

async function writePhoto(name: string): Promise<string> {
  const path = join(paths.root, name);
  await writeFile(
    path,
    await sharp({
      create: { width: 1200, height: 900, channels: 3, background: "#e17055" },
    })
      .png()
      .toBuffer(),
  );
  return path;
}

describe("resolveCardThumbnail", () => {
  it("generates a thumbnail for an uncached card instead of serving the original", async () => {
    const source = await writePhoto("photo.png");

    const target = await resolveCardThumbnail({
      saveId: "card-save",
      sourcePath: source,
      width: 256,
      version: "fixture-v1",
    });

    expect(target.path).not.toBe(source);
    expect(target.immutable).toBe(true);
    const metadata = await sharp(await readFile(target.path)).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 256, height: 192 });
  });

  it("serves the same cached thumbnail on the next request", async () => {
    const source = await writePhoto("photo.png");
    const request = {
      saveId: "card-save",
      sourcePath: source,
      width: 384,
      version: "fixture-v1",
    };

    const first = await resolveCardThumbnail(request);
    const second = await resolveCardThumbnail(request);

    expect(second).toEqual(first);
  });

  it("keeps a thumbnail for a versionless URL out of the immutable cache", async () => {
    const source = await writePhoto("photo.png");

    const target = await resolveCardThumbnail({
      saveId: "card-save",
      sourcePath: source,
      width: 256,
      version: null,
    });

    expect(target.path).not.toBe(source);
    expect(target.immutable).toBe(false);
  });

  it("falls back to the original when no thumbnail can be made", async () => {
    const source = join(paths.root, "broken.png");
    await writeFile(source, Buffer.from("not an image"));

    const target = await resolveCardThumbnail({
      saveId: "card-save",
      sourcePath: source,
      width: 256,
      version: "fixture-v1",
    });

    expect(target).toEqual({ path: source, immutable: false });
  });

  it.skipIf(process.platform !== "darwin")(
    "renders an irot HEIC thumbnail in display orientation",
    async () => {
      const bytes = await readFile(rotatedHeicFixture);
      const type = bytes.indexOf(Buffer.from("irot"));
      bytes[type + 4] = 3;
      const source = join(paths.root, "rotated.heic");
      await writeFile(source, bytes);

      const target = await resolveCardThumbnail({
        saveId: "card-save",
        sourcePath: source,
        width: 128,
        version: "fixture-v1",
      });

      expect(target.path).not.toBe(source);
      const { data, info } = await sharp(await readFile(target.path))
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect({ width: info.width, height: info.height }).toEqual({
        width: 128,
        height: 64,
      });
      const pixel = (x: number, y: number) => {
        const offset = (y * info.width + x) * info.channels;
        return [data[offset], data[offset + 1], data[offset + 2]];
      };
      expect(nearChannel(pixel(16, 8), [0, 0, 255])).toBe(true);
      expect(nearChannel(pixel(112, 8), [255, 0, 0])).toBe(true);
      expect(nearChannel(pixel(16, 56), [255, 255, 0])).toBe(true);
      expect(nearChannel(pixel(112, 56), [0, 255, 0])).toBe(true);
    },
  );
});
