import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { importedFilesComplete } from "./manual-import";

const roots: Array<string> = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
it("only acknowledges complete source imports after each expected original is present", async () => {
  const root = await mkdtemp(join(tmpdir(), "pond-manual-recovery-"));
  roots.push(root);
  await mkdir(join(root, "assets"));
  await writeFile(join(root, "assets", "one.txt"), "one");
  const files = [
    { path: "assets/one.txt", kind: "text_file", size: 3, sha256: "" },
  ];
  expect(
    await importedFilesComplete({ status: "complete", files }, root, 1),
  ).toBe(true);
  expect(
    await importedFilesComplete({ status: "ingesting", files }, root, 1),
  ).toBe(false);
  expect(
    await importedFilesComplete({ status: "complete", files: [] }, root, 1),
  ).toBe(false);
  expect(
    await importedFilesComplete({ status: "complete", files }, root, 2),
  ).toBe(false);
  await writeFile(join(root, "assets", "one.txt"), "partial");
  expect(
    await importedFilesComplete({ status: "complete", files }, root, 1),
  ).toBe(false);
  await rm(join(root, "assets", "one.txt"));
  expect(
    await importedFilesComplete({ status: "complete", files }, root, 1),
  ).toBe(false);
});
