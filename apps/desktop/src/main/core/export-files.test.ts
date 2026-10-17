import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isWindowsSymlinkPrivilegeError } from "../test/symlink";
import { copyExportFile, type ExportItem, exportFiles } from "./export-files";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pond-export-test-"));
  roots.push(root);
  const source = join(root, "source");
  const destination = join(root, "export");
  await mkdir(source);
  await mkdir(destination);
  await writeFile(join(source, "first.jpg"), "first original");
  await writeFile(join(source, "second.jpg"), "second original");
  const item: ExportItem = {
    directory: source,
    folderIds: [],
    save: {
      id: "save-1",
      title: "Reference",
      url: "https://example.test/item",
      tags: ["design"],
      notes: "Preserve this",
      files: [
        { kind: "image", path: "first.jpg", sha256: "one", size: 14 },
        { kind: "image", path: "second.jpg", sha256: "two", size: 15 },
        {
          kind: "thumbnail",
          path: "thumbnail.png",
          sha256: "thumb",
          size: 20,
        },
      ],
    },
  };
  return { root, source, destination, item };
}

describe("export files", () => {
  it("exports every original with hierarchy, memberships and metadata", async () => {
    const { destination, item } = await fixture();
    item.folderIds = ["child", "other"];
    const result = await exportFiles({
      directory: destination,
      items: [item],
      folders: [
        { id: "root", name: "Design", parentId: null },
        { id: "child", name: "Typography", parentId: "root" },
        { id: "other", name: "Inspiration", parentId: null },
      ],
    });
    expect(result.exported).toBe(4);
    expect(
      await readFile(
        join(destination, "Design", "Typography", "Reference-1.jpg"),
        "utf8",
      ),
    ).toBe("first original");
    expect(
      await readFile(
        join(destination, "Inspiration", "Reference-2.jpg"),
        "utf8",
      ),
    ).toBe("second original");
    expect(await readFile(result.manifest, "utf8")).toContain('"folderIds": [');
    expect(await readdir(join(destination, "Inspiration"))).toHaveLength(2);
  });

  it("never overwrites existing files or case-insensitive collisions", async () => {
    const { destination, item } = await fixture();
    await writeFile(join(destination, "REFERENCE-1.JPG"), "existing");
    await writeFile(join(destination, "pond-export.json"), "existing manifest");
    const result = await exportFiles({ directory: destination, items: [item] });
    expect(await readFile(join(destination, "REFERENCE-1.JPG"), "utf8")).toBe(
      "existing",
    );
    expect(await readFile(join(destination, "Reference-1-1.jpg"), "utf8")).toBe(
      "first original",
    );
    expect(basename(result.manifest)).toBe("pond-export-1.json");
    expect(await readFile(join(destination, "pond-export.json"), "utf8")).toBe(
      "existing manifest",
    );
  });

  it("serializes concurrent exports into the same directory", async () => {
    const { source, destination } = await fixture();
    const paths = await Promise.all([
      copyExportFile(join(source, "first.jpg"), destination, "File.JPG"),
      copyExportFile(join(source, "second.jpg"), destination, "file.jpg"),
    ]);
    expect(new Set(paths.map((path) => path.toLowerCase())).size).toBe(2);
    expect(
      await Promise.all(paths.map((path) => readFile(path, "utf8"))),
    ).toEqual(["first original", "second original"]);
  });

  it("rejects a missing original instead of reporting successful export", async () => {
    const { destination, item } = await fixture();
    item.save.files.push({
      kind: "video",
      path: "missing.mp4",
      sha256: "missing",
      size: 10,
    });
    await expect(
      exportFiles({ directory: destination, items: [item] }),
    ).rejects.toThrow();
    expect(await readdir(destination)).not.toContain("pond-export.json");
  });

  it("does not follow a destination folder symlink outside the export", async (ctx) => {
    const { root, destination, item } = await fixture();
    const outside = join(root, "outside");
    await mkdir(outside);
    try {
      await symlink(outside, join(destination, "Design"));
    } catch (error) {
      if (error instanceof Error && isWindowsSymlinkPrivilegeError(error)) {
        ctx.skip("Windows symlink privilege is unavailable");
        return;
      }
      throw error;
    }
    item.folderIds = ["folder"];
    await expect(
      exportFiles({
        directory: destination,
        items: [item],
        folders: [{ id: "folder", name: "Design", parentId: null }],
      }),
    ).rejects.toThrow("outside");
    expect(await readdir(outside)).toEqual([]);
  });
});
