import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { importFiles } from "./import-files";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pond-folder-import-"));
  roots.push(root);
  const tree = join(root, "Design");
  await mkdir(join(tree, "Type"), { recursive: true });
  await writeFile(join(tree, "reference.png"), "reference");
  await writeFile(join(tree, "Type", "reference.png"), "type");
  const folders: Array<{ id: string; name: string; parentId: string | null }> =
    [];
  const files: Array<{
    id: string;
    filePaths: string[];
    tags: string[];
    importedFrom?: string;
    folderIds: string[];
  }> = [];
  const runtime: NonNullable<Parameters<typeof importFiles>[1]> = {
    async createFolder(input) {
      const folder = { ...input, id: `folder-${folders.length}` };
      folders.push(folder);
      return folder;
    },
    async importFile(input) {
      const file = { ...input, id: `save-${files.length}`, folderIds: [] };
      files.push(file);
      return { ok: true, id: file.id };
    },
    async assignFolders(id, folderIds) {
      const file = files.find((value) => value.id === id);
      if (!file) return { ok: false };
      file.folderIds = folderIds;
      return { ok: true };
    },
  };
  return { tree, root, folders, files, runtime };
}

describe("hierarchy-preserving file import", () => {
  it("creates matching nested folders and keeps same-name files in their own folders", async () => {
    const { tree, folders, files, runtime } = await fixture();
    const result = await importFiles(
      { paths: [tree], tags: ["inspiration"], folderIds: ["destination"] },
      runtime,
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.ids).toHaveLength(2);
    expect(folders).toEqual([
      { id: "folder-0", name: "Design", parentId: "destination" },
      { id: "folder-1", name: "Type", parentId: "folder-0" },
    ]);
    expect(
      files.find(
        (file) => file.filePaths[0] === join(tree, "Type", "reference.png"),
      )?.folderIds,
    ).toEqual(["destination", "folder-1"]);
    expect(
      files.find((file) => file.filePaths[0] === join(tree, "reference.png"))
        ?.folderIds,
    ).toEqual(["destination", "folder-0"]);
    expect(files.every((file) => file.tags.includes("inspiration"))).toBe(true);
    expect(files.every((file) => file.importedFrom === "files")).toBe(true);
  });

  it("records the origin the caller names", async () => {
    const { tree, files, runtime } = await fixture();
    await importFiles(
      { paths: [join(tree, "reference.png")], origin: "clipboard" },
      runtime,
    );
    expect(files.map((file) => file.importedFrom)).toEqual(["clipboard"]);
  });

  it("imports standalone files without manufacturing a parent folder", async () => {
    const { tree, folders, files, runtime } = await fixture();
    const path = join(tree, "reference.png");
    const result = await importFiles({ paths: [path, path] }, runtime);
    if (!result.ok) throw new Error(result.error);
    expect(result.ids).toHaveLength(1);
    expect(folders).toEqual([]);
    expect(files[0]?.folderIds).toEqual([]);
  });

  it("reuses reviewed duplicates without creating another Save", async () => {
    const { tree, files, runtime } = await fixture();
    const path = join(tree, "reference.png");
    files.push({
      id: "existing-save",
      filePaths: [],
      tags: [],
      folderIds: [],
    });
    const result = await importFiles(
      {
        paths: [path],
        folderIds: ["destination"],
        useExisting: { [path]: "existing-save" },
      },
      runtime,
    );
    expect(result).toMatchObject({ ok: true, ids: ["existing-save"] });
    expect(files).toHaveLength(1);
    expect(files[0]?.folderIds).toEqual(["destination"]);
  });

  it("continues readable files and reports failed paths without false success counts", async () => {
    const { tree, root, runtime } = await fixture();
    const missing = join(root, "missing.png");
    const result = await importFiles(
      { paths: [missing, join(tree, "reference.png")] },
      runtime,
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.ids).toHaveLength(1);
    expect(result.failedPaths).toEqual([missing]);
  });
});
