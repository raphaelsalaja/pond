import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { invalidatePaths, resolvePaths, thumbnailCacheRoot } from "../paths";
import { resolveCardThumbnail } from "./thumbnail";

const paths = { root: "" };

beforeEach(async () => {
  paths.root = await mkdtemp(join(tmpdir(), "pond-card-thumbnail-"));
  resolvePaths(paths.root);
});

afterEach(async () => {
  await rm(thumbnailCacheRoot(), { recursive: true, force: true });
  invalidatePaths();
  await rm(paths.root, { recursive: true, force: true });
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
});
