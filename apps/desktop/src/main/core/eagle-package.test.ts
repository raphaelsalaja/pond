import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { isWindowsSymlinkPrivilegeError } from "../test/symlink";
import {
  type EaglePackageExportInput,
  type EaglePackageImportRuntime,
  exportEaglePackage,
  importEaglePackage,
} from "./eagle-package";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function temporaryRoot(name: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), `pond-eagle-${name}-`));
  roots.push(root);
  return root;
}

async function exportFixture() {
  const root = await temporaryRoot("export");
  const source = join(root, "source");
  await mkdir(source);
  await writeFile(join(source, "photo.jpg"), "original");
  const thumbnail = await sharp({
    create: {
      width: 16,
      height: 12,
      channels: 3,
      background: "#336699",
    },
  })
    .webp()
    .toBuffer();
  await writeFile(join(source, "preview.webp"), thumbnail);
  const input: EaglePackageExportInput = {
    folders: [
      { id: "parent", name: "Design", parentId: null, sortOrder: 0 },
      { id: "child", name: "Posters", parentId: "parent", sortOrder: 0 },
    ],
    items: [
      {
        directory: source,
        folderIds: ["child"],
        save: {
          id: "save-1",
          title: "Reference",
          url: "https://example.test/reference",
          tags: ["Print", "Layout"],
          notes: "A note",
          width: 640,
          height: 480,
          rating: 4,
          dominantColors: ["#112233"],
          savedAt: new Date("2024-01-02T00:00:00.000Z"),
          createdAt: new Date("2024-01-01T00:00:00.000Z"),
          files: [
            {
              kind: "image",
              path: "photo.jpg",
              size: 8,
              sha256: "original",
            },
            {
              kind: "thumbnail",
              path: "preview.webp",
              size: thumbnail.byteLength,
              sha256: "thumbnail",
              mimeType: "image/webp",
            },
          ],
        },
      },
    ],
  };
  return { root, source, input };
}

interface ImportedItem {
  eagleId: string;
  media: string[];
  thumbnail: Buffer | null;
  folderIds: string[];
  tags: string[];
}

function fakeRuntime(options: { failId?: string } = {}) {
  const imported = new Map<string, ImportedItem>();
  const rolledBack: string[][] = [];
  const folders: string[][] = [];
  const runtime: EaglePackageImportRuntime = {
    async folders(nodes) {
      folders.push(nodes.map((node) => node.name));
      return {
        mapped: new Map(nodes.map((node) => [node.id, `mapped-${node.id}`])),
        createdIds: nodes.map((node) => `mapped-${node.id}`),
      };
    },
    async existing(eagleId) {
      return imported.has(eagleId) ? `imported-${eagleId}` : null;
    },
    async importItem(item, folderIds) {
      if (item.metadata.id === options.failId)
        return { ok: false, error: "synthetic failure" };
      imported.set(item.metadata.id, {
        eagleId: item.metadata.id,
        media: await Promise.all(
          item.mediaPaths.map((path) => readFile(path, "utf8")),
        ),
        thumbnail: item.thumbnailPath
          ? await readFile(item.thumbnailPath)
          : null,
        folderIds,
        tags: item.metadata.tags ?? [],
      });
      return { ok: true, id: `imported-${item.metadata.id}` };
    },
    async rollback(saveIds, folderIds) {
      rolledBack.push([...saveIds, ...folderIds]);
      for (const id of saveIds) imported.delete(id.replace(/^imported-/, ""));
    },
  };
  return { runtime, imported, rolledBack, folders };
}

async function directoryFixture(items = ["one"]) {
  const root = await temporaryRoot("directory");
  const packageRoot = join(root, "Selection.eaglepack");
  await mkdir(packageRoot);
  const images = items.map((id) => ({
    id,
    name: `Save ${id}`,
    ext: "txt",
    tags: ["Reference"],
    folders: ["child"],
    url: "",
    annotation: `Note ${id}`,
    isDeleted: false,
  }));
  await writeFile(
    join(packageRoot, "pack.json"),
    JSON.stringify({
      images,
      folder: {
        id: "parent",
        name: "Design",
        children: [{ id: "child", name: "Posters", children: [] }],
      },
    }),
  );
  for (const item of images) {
    const directory = join(packageRoot, `${item.id}.info`);
    await mkdir(directory);
    await writeFile(join(directory, "metadata.json"), JSON.stringify(item));
    await writeFile(join(directory, `${item.id}.txt`), `body-${item.id}`);
    await writeFile(
      join(directory, `${item.id}.txt_thumbnail.png`),
      `thumbnail-${item.id}`,
    );
  }
  return { root, packageRoot };
}

describe("Eagle package transfer", () => {
  it("round trips archive metadata, tags, folders, originals and thumbnails", async () => {
    const fixture = await exportFixture();
    const destination = join(fixture.root, "Selection.eaglepack");
    const exported = await exportEaglePackage(fixture.input, destination);
    expect(exported).toEqual({ path: destination, exported: 2 });
    const archive = await JSZip.loadAsync(await readFile(destination));
    const packFile = archive.file("pack.json");
    if (!packFile) throw new Error("Missing pack.json");
    const pack = z
      .object({
        folder: z.object({ id: z.string(), name: z.string() }).optional(),
        folders: z.unknown().optional(),
      })
      .passthrough()
      .parse(JSON.parse(await packFile.async("string")));
    const thumbnailFile = archive.file("save-1.info/photo.jpg_thumbnail.png");
    if (!thumbnailFile) throw new Error("Missing exported thumbnail");
    expect(
      (await sharp(await thumbnailFile.async("nodebuffer")).metadata()).format,
    ).toBe("png");
    expect(pack.folder).toMatchObject({ id: "parent", name: "Design" });
    expect(pack).not.toHaveProperty("folders");

    const target = fakeRuntime();
    await expect(
      importEaglePackage(destination, target.runtime),
    ).resolves.toEqual({ imported: 1, skipped: 0 });
    expect(target.folders).toEqual([["Design", "Posters"]]);
    expect(target.imported.get("save-1")).toMatchObject({
      eagleId: "save-1",
      media: ["original"],
      folderIds: ["mapped-child"],
      tags: ["Print", "Layout"],
    });
    const importedThumbnail = target.imported.get("save-1")?.thumbnail;
    if (!importedThumbnail) throw new Error("Missing imported thumbnail");
    expect((await sharp(importedThumbnail).metadata()).format).toBe("png");
    await expect(
      importEaglePackage(destination, target.runtime),
    ).resolves.toEqual({ imported: 0, skipped: 1 });
  });

  it("imports a synthetic Eagle directory and preserves nested mappings", async () => {
    const fixture = await directoryFixture();
    const target = fakeRuntime();
    await expect(
      importEaglePackage(fixture.packageRoot, target.runtime),
    ).resolves.toEqual({ imported: 1, skipped: 0 });
    expect(target.imported.get("one")).toMatchObject({
      media: ["body-one"],
      folderIds: ["mapped-child"],
      tags: ["Reference"],
    });
    expect(target.imported.get("one")?.thumbnail?.toString()).toBe(
      "thumbnail-one",
    );
  });

  it("rejects directory symlinks before importing anything", async (ctx) => {
    const fixture = await directoryFixture();
    const outside = join(fixture.root, "outside.txt");
    await writeFile(outside, "outside");
    try {
      await symlink(outside, join(fixture.packageRoot, "linked.txt"));
    } catch (error) {
      if (error instanceof Error && isWindowsSymlinkPrivilegeError(error)) {
        ctx.skip("Windows symlink privilege is unavailable");
        return;
      }
      throw error;
    }
    const target = fakeRuntime();
    await expect(
      importEaglePackage(fixture.packageRoot, target.runtime),
    ).rejects.toThrow("symbolic links");
    expect(target.imported.size).toBe(0);
    expect(target.folders).toEqual([]);
  });

  it("rejects archive traversal and symbolic links", async () => {
    const root = await temporaryRoot("unsafe-archive");
    const traversalPath = join(root, "traversal.eaglepack");
    const traversal = new JSZip();
    traversal.file("../outside.txt", "outside");
    await writeFile(
      traversalPath,
      await traversal.generateAsync({ type: "nodebuffer" }),
    );
    await expect(
      importEaglePackage(traversalPath, fakeRuntime().runtime),
    ).rejects.toThrow("unsafe path");

    const symlinkPath = join(root, "symlink.eaglepack");
    const linked = new JSZip();
    linked.file("linked", "outside", { unixPermissions: 0o120777 });
    await writeFile(
      symlinkPath,
      await linked.generateAsync({ type: "nodebuffer", platform: "UNIX" }),
    );
    await expect(
      importEaglePackage(symlinkPath, fakeRuntime().runtime),
    ).rejects.toThrow("symbolic links");
  });

  it("applies extraction limits before package mutation", async () => {
    const fixture = await directoryFixture();
    const target = fakeRuntime();
    await expect(
      importEaglePackage(fixture.packageRoot, target.runtime, {
        fileBytes: 5,
      }),
    ).rejects.toThrow("extraction limit");
    expect(target.folders).toEqual([]);
    expect(target.imported.size).toBe(0);
  });

  it("rolls back imported Saves and folders when a commit fails", async () => {
    const fixture = await directoryFixture(["one", "two"]);
    const target = fakeRuntime({ failId: "two" });
    await expect(
      importEaglePackage(fixture.packageRoot, target.runtime),
    ).rejects.toThrow("synthetic failure");
    expect(target.imported.size).toBe(0);
    expect(target.rolledBack).toEqual([
      ["imported-one", "mapped-parent", "mapped-child"],
    ]);
  });

  it("removes export staging and leaves no destination after failure", async () => {
    const fixture = await exportFixture();
    const destination = join(fixture.root, "Broken.eaglepack");
    fixture.input.items[0]?.save.files.push({
      kind: "file",
      path: "missing.bin",
      size: 1,
      sha256: "missing",
    });
    await expect(
      exportEaglePackage(fixture.input, destination),
    ).rejects.toThrow();
    await expect(lstat(destination)).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      (await readdir(fixture.root)).filter((name) =>
        name.startsWith(".eagle-package-"),
      ),
    ).toEqual([]);
  });
});
