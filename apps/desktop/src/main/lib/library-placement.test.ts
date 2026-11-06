import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { invalidatePaths, resolvePaths } from "../paths";
import {
  classifyLibraryPlacement,
  libraryWriteBlock,
  observeLibrarySync,
  onLibraryDisplaced,
  pinOpenLibrary,
  refreshLibraryPlacement,
  resetLibraryPlacement,
} from "./library-placement";

const roots: string[] = [];

afterEach(async () => {
  resetLibraryPlacement();
  invalidatePaths();
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function library(id = "library-1"): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "pond-placement-"));
  roots.push(parent);
  const root = join(parent, "My Pond.pond");
  await mkdir(root);
  await writeFile(
    join(root, "metadata.json"),
    JSON.stringify({ id, name: "My Pond" }),
  );
  pinOpenLibrary(root, id);
  return root;
}

it("classifies a moved folder as missing and a different library at the same path as replaced", async () => {
  const root = await library();
  const open = { root, libraryId: "library-1" };
  expect(classifyLibraryPlacement(open, observeLibrarySync(root))).toBe(
    "present",
  );

  await rm(root, { recursive: true });
  expect(classifyLibraryPlacement(open, observeLibrarySync(root))).toBe(
    "missing",
  );

  await mkdir(root);
  expect(classifyLibraryPlacement(open, observeLibrarySync(root))).toBe(
    "missing",
  );
  await writeFile(
    join(root, "metadata.json"),
    JSON.stringify({ id: "other-library" }),
  );
  expect(classifyLibraryPlacement(open, observeLibrarySync(root))).toBe(
    "replaced",
  );
});

it("does not recreate items or a new library id after the open folder disappears", async () => {
  const root = await library("627e96e5ffc5833a030688eae64ce2fd");
  invalidatePaths();
  resolvePaths(root);
  await rm(root, { recursive: true });
  invalidatePaths();

  const paths = resolvePaths(root);
  expect(existsSync(root)).toBe(false);
  expect(existsSync(join(root, "items"))).toBe(false);
  expect(paths.libraryId).toBe("627e96e5ffc5833a030688eae64ce2fd");
  expect(libraryWriteBlock(root)).toMatch(/missing/);
  expect(existsSync(root)).toBe(false);
});

it("notifies once when the open library disappears", async () => {
  const root = await library();
  let calls = 0;
  onLibraryDisplaced(() => {
    calls += 1;
  });
  await rm(root, { recursive: true });
  expect(refreshLibraryPlacement(root)).toBe("missing");
  expect(refreshLibraryPlacement(root)).toBe("missing");
  await new Promise((resolve) => setImmediate(resolve));
  expect(calls).toBe(1);
});
