import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  directoryExists,
  isLibrarySidecar,
  isSaveFolderName,
} from "./library-sidecars";

const roots: Array<string> = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("library sidecars", () => {
  it("recognizes AppleDouble files and Finder metadata", () => {
    expect(isLibrarySidecar("._info.json")).toBe(true);
    expect(isLibrarySidecar("._save.info")).toBe(true);
    expect(isLibrarySidecar(".DS_Store")).toBe(true);
    expect(isLibrarySidecar("info.json")).toBe(false);
    expect(isLibrarySidecar("save.info")).toBe(false);
  });

  it("keeps real Save folders and drops sidecar names", () => {
    expect(isSaveFolderName("save.info")).toBe(true);
    expect(isSaveFolderName("._save.info")).toBe(false);
    expect(isSaveFolderName(".DS_Store")).toBe(false);
    expect(isSaveFolderName("info.json")).toBe(false);
  });

  it("treats a sidecar file at a Save path as absent", async () => {
    const root = await mkdtemp(join(tmpdir(), "pond-library-sidecars-"));
    roots.push(root);
    await mkdir(join(root, "save.info"));
    await writeFile(join(root, "._save.info"), "sidecar");
    expect(directoryExists(join(root, "save.info"))).toBe(true);
    expect(directoryExists(join(root, "._save.info"))).toBe(false);
    expect(directoryExists(join(root, "missing.info"))).toBe(false);
  });
});
