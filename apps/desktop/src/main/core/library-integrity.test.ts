import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import {
  eaglePreviewName,
  inspectSaveIntegrity,
  libraryIntegrityRuntime,
} from "./library-integrity";
import type {
  IntegritySave,
  LibraryIntegrityRuntime,
} from "./library-integrity";
import { renderThumbnail } from "./save-thumbnail-file";
import { noiseSceneJpeg } from "./save-thumbnail.fixtures";
import { writeLibraryMedia } from "./storage/library-media-storage";

/** Windows holds the files libvips reads open, so cached handles would block cleanup. */
sharp.cache(false);

const roots: Array<string> = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true,
        maxRetries: 5,
        retryDelay: 50,
      }),
    ),
  );
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pond-library-repair-"));
  roots.push(root);
  await mkdir(join(root, "items", "save-1.info"), { recursive: true });
  return root;
}

function fixtureSave(files: IntegritySave["files"]): IntegritySave {
  return {
    id: "save-1",
    title: "Fixture",
    source: "web",
    sourceId: "fixture",
    url: "https://example.com/fixture",
    files,
  };
}

function runtime(root: string): LibraryIntegrityRuntime {
  return {
    ...libraryIntegrityRuntime,
    root: () => root,
    listSaves: async () => [],
    getSave: async () => null,
  };
}

function file(kind: string, path: string, bytes: Uint8Array) {
  return {
    kind,
    path,
    size: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function gradient(size: number, reverse: boolean) {
  const pixels = Buffer.alloc(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const value = Math.round((x / (size - 1)) * 255);
      pixels[y * size + x] = reverse ? 255 - value : value;
    }
  }
  return sharp(pixels, { raw: { width: size, height: size, channels: 1 } })
    .png()
    .toBuffer();
}

describe("Library integrity repair previews", () => {
  it("preserves a verified custom thumbnail in a plaintext fixture", async () => {
    const root = await fixtureRoot();
    const directory = join(root, "items", "save-1.info");
    const original = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: "#336699",
      },
    })
      .png()
      .toBuffer();
    const custom = await sharp({
      create: {
        width: 8,
        height: 8,
        channels: 3,
        background: "#993366",
      },
    })
      .png()
      .toBuffer();
    await Promise.all([
      writeFile(join(directory, "photo.png"), original),
      writeFile(join(directory, "photo.png_thumbnail.png"), custom),
    ]);
    const row = fixtureSave([
      file("image", "photo.png", original),
      file("thumbnail", "photo.png_thumbnail.png", custom),
    ]);

    await expect(
      inspectSaveIntegrity({
        kind: "thumbnails",
        row,
        runtime: runtime(root),
      }),
    ).resolves.toBeNull();
  });

  const mismatch = expect.objectContaining({
    summary: "Thumbnail doesn't match this save",
    action: expect.objectContaining({ kind: "thumbnail", source: "photo.png" }),
  });

  it.each([
    { name: "a resized copy", reverse: false, custom: false, expected: null },
    { name: "another image", reverse: true, custom: false, expected: mismatch },
    { name: "a picked image", reverse: true, custom: true, expected: null },
  ])("compares a thumbnail of $name with the original", async (fixture) => {
    const root = await fixtureRoot();
    const directory = join(root, "items", "save-1.info");
    const original = await gradient(64, false);
    const thumbnail = await gradient(32, fixture.reverse);
    await Promise.all([
      writeFile(join(directory, "photo.png"), original),
      writeFile(join(directory, "photo.png_thumbnail.png"), thumbnail),
    ]);
    const row = fixtureSave([
      file("image", "photo.png", original),
      {
        ...file("thumbnail", "photo.png_thumbnail.png", thumbnail),
        custom: fixture.custom || undefined,
      },
    ]);

    const issue = await inspectSaveIntegrity({
      kind: "thumbnails",
      row,
      runtime: runtime(root),
    });

    expect(issue).toEqual(fixture.expected);
  });

  it("keeps the lossy thumbnail its own renderer produced from a noise-heavy source", async () => {
    const root = await fixtureRoot();
    const directory = join(root, "items", "save-1.info");
    const original = await noiseSceneJpeg();
    const thumbnail = await renderThumbnail(original);
    expect(thumbnail).not.toBeNull();
    if (!thumbnail) return;
    await Promise.all([
      writeFile(join(directory, "photo.jpg"), original),
      writeFile(join(directory, "photo.jpg_thumbnail.webp"), thumbnail),
    ]);
    const row = fixtureSave([
      file("image", "photo.jpg", original),
      file("thumbnail", "photo.jpg_thumbnail.webp", thumbnail),
    ]);

    await expect(
      inspectSaveIntegrity({
        kind: "thumbnails",
        row,
        runtime: runtime(root),
      }),
    ).resolves.toBeNull();
  });

  it("flags a text card left beside an image", async () => {
    const root = await fixtureRoot();
    const directory = join(root, "items", "save-1.info");
    const original = await gradient(64, false);
    const card = await gradient(32, false);
    await Promise.all([
      writeFile(join(directory, "photo.png"), original),
      writeFile(join(directory, "thumbnail-dark.png"), card),
    ]);
    const row = fixtureSave([
      file("image", "photo.png", original),
      file("thumbnail_dark", "thumbnail-dark.png", card),
    ]);

    await expect(
      inspectSaveIntegrity({
        kind: "thumbnails",
        row,
        runtime: runtime(root),
      }),
    ).resolves.toMatchObject({ summary: "Thumbnail doesn't match this save" });
  });

  it("reads payloads before offering metadata recovery", async () => {
    const root = await fixtureRoot();
    const directory = join(root, "items", "save-1.info");
    const payload = Buffer.from("verified payload");
    const row = fixtureSave([file("other", "payload.bin", payload)]);
    await writeLibraryMedia(join(directory, "payload.bin"), payload);
    const infoPath = join(directory, "info.json");
    await writeFile(infoPath, Buffer.from("{not-json"));

    const issue = await inspectSaveIntegrity({
      kind: "save-metadata",
      row,
      runtime: runtime(root),
    });

    expect(issue).toMatchObject({
      kind: "save-metadata",
      saveId: "save-1",
      summary: "Save record is out of date",
    });
  });

  it("never offers metadata recovery when a payload hash is stale", async () => {
    const root = await fixtureRoot();
    const directory = join(root, "items", "save-1.info");
    const expected = Buffer.from("expected");
    await writeFile(join(directory, "payload.bin"), Buffer.from("changed!"));
    const row = fixtureSave([file("other", "payload.bin", expected)]);

    await expect(
      inspectSaveIntegrity({
        kind: "save-metadata",
        row,
        runtime: runtime(root),
      }),
    ).resolves.toBeNull();
  });

  it("plans safe physical names without changing the Save title", async () => {
    const root = await fixtureRoot();
    const directory = join(root, "items", "save-1.info");
    const payload = Buffer.from("payload");
    await writeFile(join(directory, "bad:name.txt"), payload);
    const row = fixtureSave([file("other", "bad:name.txt", payload)]);

    const issue = await inspectSaveIntegrity({
      kind: "physical-file-names",
      row,
      runtime: runtime(root),
    });

    expect(issue?.title).toBe("Fixture");
    expect(issue?.action).toEqual({
      kind: "physical-file-names",
      renames: [{ from: "bad:name.txt", to: "bad-name.txt" }],
    });
  });

  it.each([
    ["cover.", "cover"],
    ["photo.jpg ", "photo.jpg"],
    ["con.tar.gz", "file-con.tar.gz"],
  ])("plans a name for %j that passes its own check", async (from, to) => {
    const root = await fixtureRoot();
    const directory = join(root, "items", "save-1.info");
    const payload = Buffer.from("payload");
    await writeFile(join(directory, from), payload);
    const row = fixtureSave([file("other", from, payload)]);

    const issue = await inspectSaveIntegrity({
      kind: "physical-file-names",
      row,
      runtime: runtime(root),
    });

    expect(issue?.action).toEqual({
      kind: "physical-file-names",
      renames: [{ from, to }],
    });
  });
});

function eagleRuntime(
  original: { id: string; title: string } | null,
): LibraryIntegrityRuntime {
  return {
    ...runtime("/unused"),
    eaglePreviewOriginal: async () => original,
  };
}

describe("Eagle preview duplicates", () => {
  it("flags a preview Save when its original is in the Library", async () => {
    const row = { ...fixtureSave([]), title: "Sunset_thumbnail" };

    const issue = await inspectSaveIntegrity({
      kind: "eagle-previews",
      row,
      runtime: eagleRuntime({ id: "save-0", title: "Sunset" }),
    });

    expect(issue?.action).toEqual({
      kind: "eagle-previews",
      originalId: "save-0",
    });
    expect(issue?.detail).toContain("“Sunset”");
  });

  it("keeps a preview Save whose original is gone", async () => {
    const row = { ...fixtureSave([]), title: "Sunset_thumbnail" };

    await expect(
      inspectSaveIntegrity({
        kind: "eagle-previews",
        row,
        runtime: eagleRuntime(null),
      }),
    ).resolves.toBeNull();
  });

  it("never looks up a Save whose title isn't a preview name", async () => {
    let looked = false;
    const issue = await inspectSaveIntegrity({
      kind: "eagle-previews",
      row: { ...fixtureSave([]), title: "Thumbnail sketches" },
      runtime: {
        ...runtime("/unused"),
        eaglePreviewOriginal: async () => {
          looked = true;
          return { id: "save-0", title: "Thumbnail sketches" };
        },
      },
    });

    expect(issue).toBeNull();
    expect(looked).toBe(false);
  });

  it("reads the original's name from the preview title", () => {
    expect(eaglePreviewName("Sunset_thumbnail")).toBe("Sunset");
    expect(eaglePreviewName("Sunset_THUMBNAIL ")).toBe("Sunset");
    expect(eaglePreviewName("_thumbnail")).toBeNull();
    expect(eaglePreviewName("Sunset thumbnail")).toBeNull();
    expect(eaglePreviewName(null)).toBeNull();
  });
});
