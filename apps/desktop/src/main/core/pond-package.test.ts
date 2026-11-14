import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { exportFiles } from "./export-files";
import { importPondPackage } from "./pond-package";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture(extra: [string, string][] = []) {
  const root = await mkdtemp(join(tmpdir(), "pond-package-test-"));
  roots.push(root);
  const original = join(root, "original");
  const directory = join(root, "Saves.pondpack");
  await mkdir(original);
  await mkdir(directory);
  const files = [];
  for (const [name, content] of [
    ["one.jpg", "first"],
    ["two.jpg", "second"],
    ...extra,
  ]) {
    if (!name || content === undefined)
      throw new Error("Missing test original");
    await mkdir(dirname(join(original, name)), { recursive: true });
    await writeFile(join(original, name), content);
    files.push({
      kind: "image",
      path: name,
      size: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
    });
  }
  await writeFile(
    join(original, "user-title.json"),
    JSON.stringify({ data: { locked: true } }),
  );
  await exportFiles({
    includeDerived: true,
    directory,
    folders: [
      { id: "parent", name: "Design", parentId: null },
      { id: "child", name: "Posters", parentId: "parent" },
    ],
    items: [
      {
        directory: original,
        folderIds: ["child"],
        save: {
          id: "source-save",
          source: "local",
          sourceId: "local-source",
          title: "A Save",
          url: "pond:local/test",
          notes: "My notes",
          tags: ["Print"],
          files,
          rating: 4,
          inboxState: "snoozed",
          inboxUntil: Date.parse("2030-01-01T00:00:00.000Z"),
          savedAt: new Date("2020-01-01T00:00:00.000Z"),
        },
      },
    ],
  });
  return { root, directory };
}
function destination(root: string) {
  const imported = new Map<
    string,
    {
      id: string;
      paths: string[];
      title?: string | null;
      savedAt?: Date;
      folders: string[];
    }
  >();
  const names: string[] = [];
  const dependencies: NonNullable<Parameters<typeof importPondPackage>[1]> = {
    async folders(rows) {
      names.push(...rows.map((row) => row.name));
      return new Map(rows.map((row) => [row.id, `mapped-${row.id}`]));
    },
    directory: (id) => join(root, id),
    async existing(input) {
      return imported.get(input.sourceId || "missing")?.id ?? null;
    },
    async commit(id, input, folders) {
      const directory = join(root, id);
      const paths = input.files.map((file) => join(directory, file.path));
      imported.set(input.sourceId || "missing", {
        id,
        paths,
        title: input.title,
        savedAt: input.savedAt ? new Date(input.savedAt) : undefined,
        folders,
      });
      await writeFile(join(directory, "metadata.json"), JSON.stringify(input));
    },
  };
  return { dependencies, imported, names };
}

describe("Pond package transfer", () => {
  it("round trips every original, metadata dates and nested membership; reimport skips existing Saves", async () => {
    const { root, directory } = await fixture();
    const target = destination(root);
    expect(await importPondPackage(directory, target.dependencies)).toEqual({
      imported: 1,
      skipped: 0,
    });
    const row = target.imported.get("local-source");
    expect(row?.title).toBe("A Save");
    expect(row?.savedAt?.getUTCFullYear()).toBe(2020);
    expect(row?.folders).toEqual(["mapped-child"]);
    expect(target.names).toEqual(["Design", "Posters"]);
    expect(
      await Promise.all(
        (row?.paths ?? []).map((path) => readFile(path, "utf8")),
      ),
    ).toEqual(["first", "second"]);
    const metadata = JSON.parse(
      await readFile(join(root, row?.id ?? "missing", "metadata.json"), "utf8"),
    );
    expect(metadata.rating).toBe(4);
    expect(metadata.inbox).toEqual({
      state: "snoozed",
      until: "2030-01-01T00:00:00.000Z",
    });
    expect(
      JSON.parse(
        await readFile(
          join(root, row?.id ?? "missing", "user-title.json"),
          "utf8",
        ),
      ).data.locked,
    ).toBe(true);
    expect(metadata.notes).toBe("My notes");
    expect(await importPondPackage(directory, target.dependencies)).toEqual({
      imported: 0,
      skipped: 1,
    });
  });
  it("retains nested archive paths and zero-byte attachments", async () => {
    const { root, directory } = await fixture([
      ["assets/style.css", "body{}"],
      ["empty.txt", ""],
    ]);
    const target = destination(root);
    await importPondPackage(directory, target.dependencies);
    const row = target.imported.get("local-source");
    expect(
      await readFile(
        join(root, row?.id ?? "missing", "assets/style.css"),
        "utf8",
      ),
    ).toBe("body{}");
    expect(
      await readFile(join(root, row?.id ?? "missing", "empty.txt"), "utf8"),
    ).toBe("");
  });
  it("detects a replaced original during import before committing a Save", async () => {
    const { root, directory } = await fixture();
    const target = destination(root);
    const assign = target.dependencies.folders;
    target.dependencies.folders = async (rows) => {
      await writeFile(
        join(directory, "Design", "Posters", "A Save-1.jpg"),
        "changed",
      );
      return assign(rows);
    };
    await expect(
      importPondPackage(directory, target.dependencies),
    ).rejects.toThrow("changed during import");
    expect(target.imported.size).toBe(0);
  });
  it("validates every original before creating any folders or Saves", async () => {
    const { root, directory } = await fixture();
    const target = destination(root);
    await writeFile(
      join(directory, "Design", "Posters", "A Save-2.jpg"),
      "bad",
    );
    await expect(
      importPondPackage(directory, target.dependencies),
    ).rejects.toThrow("missing or damaged");
    expect(target.imported.size).toBe(0);
    expect(target.names).toEqual([]);
  });
  it("rejects a manifest path that escapes the package", async () => {
    const { root, directory } = await fixture();
    const target = destination(root);
    const manifestPath = join(directory, "pond-export.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.exportedFiles[0].path = "../original/one.jpg";
    await writeFile(manifestPath, JSON.stringify(manifest));
    await expect(
      importPondPackage(directory, target.dependencies),
    ).rejects.toThrow("outside the package");
    expect(target.imported.size).toBe(0);
  });
});
