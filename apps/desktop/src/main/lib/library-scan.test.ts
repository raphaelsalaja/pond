import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { listSaveFolderIds, scanLibrary } from "./library";

const roots: Array<string> = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function libraryWithSidecars(): Promise<{ root: string; items: string }> {
  const root = await mkdtemp(join(tmpdir(), "pond-library-scan-"));
  roots.push(root);
  const items = join(root, "items");
  await mkdir(join(items, "save.info"), { recursive: true });
  await mkdir(join(items, "lost.info"));
  await writeFile(join(items, "save.info", "info.json"), "{}");
  await writeFile(join(items, "._save.info"), "folder sidecar");
  await writeFile(join(items, "stray.info"), "not a folder");
  await writeFile(join(items, ".DS_Store"), "finder");
  return { root, items };
}

it("lists only Save directories when AppleDouble files sit beside them", async () => {
  const { root, items } = await libraryWithSidecars();
  expect((await listSaveFolderIds(items)).sort()).toEqual(["lost", "save"]);
  const scanned: Array<string> = [];
  for await (const entry of scanLibrary(root)) {
    scanned.push(entry.id);
  }
  expect(scanned.sort()).toEqual(["lost", "save"]);
});

it("yields nothing when the library has no items directory", async () => {
  const root = await mkdtemp(join(tmpdir(), "pond-library-scan-"));
  roots.push(root);
  const scanned: Array<string> = [];
  for await (const entry of scanLibrary(root)) {
    scanned.push(entry.id);
  }
  expect(scanned).toEqual([]);
});
