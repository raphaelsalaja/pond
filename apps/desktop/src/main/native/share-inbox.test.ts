import { existsSync } from "node:fs";
import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { importSharedFiles, inboxEntries } from "./share-inbox";

async function inbox() {
  const root = await realpath(await mkdtemp(join(tmpdir(), "pond-share-")));
  const drop = join(root, "a1b2");
  await mkdir(drop);
  const file = join(drop, "poster.png");
  await writeFile(file, "png");
  return { root, drop, file };
}

describe("inboxEntries", () => {
  it("keeps files inside the inbox", async () => {
    const { root, drop, file } = await inbox();
    expect(await inboxEntries([file], root)).toEqual([{ file, drop }]);
  });

  it("drops paths outside the inbox, including traversal", async () => {
    const { root } = await inbox();
    expect(
      await inboxEntries(
        ["/etc/hosts", join(root, "a1b2", "..", "..", "x")],
        root,
      ),
    ).toEqual([]);
  });

  it("drops files sitting directly in the inbox root", async () => {
    const { root } = await inbox();
    const loose = join(root, "loose.png");
    await writeFile(loose, "png");
    expect(await inboxEntries([loose], root)).toEqual([]);
  });
});

describe("importSharedFiles", () => {
  it("imports inbox files and removes their drop folders", async () => {
    const { root, drop, file } = await inbox();
    const imported: Array<ReadonlyArray<string>> = [];
    const importFiles = async (input: { paths: ReadonlyArray<string> }) => {
      imported.push(input.paths);
      return { ok: true as const, ids: ["s1"], failedPaths: [] };
    };
    const result = await importSharedFiles([file], { root, importFiles });
    expect(imported).toEqual([[file]]);
    expect(result).toEqual({ ids: ["s1"] });
    expect(existsSync(drop)).toBe(false);
  });

  it("removes drop folders when the import fails", async () => {
    const { root, drop, file } = await inbox();
    const importFiles = async () => ({
      ok: false as const,
      error: "no_files",
    });
    await expect(
      importSharedFiles([file], { root, importFiles }),
    ).rejects.toThrow("no_files");
    expect(existsSync(drop)).toBe(false);
  });

  it("refuses when no path is inside the inbox", async () => {
    const { root } = await inbox();
    const importFiles = vi.fn();
    await expect(
      importSharedFiles(["/etc/hosts"], { root, importFiles }),
    ).rejects.toThrow("no_files");
    expect(importFiles).not.toHaveBeenCalled();
  });
});
