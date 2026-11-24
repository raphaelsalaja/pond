import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  libraryPathForName,
  removeMovedLibrarySource,
  renameLibraryBundle,
  rollbackLibraryRename,
} from "./library-lifecycle";

const roots: Array<string> = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createLibrary(name: string) {
  const parent = await mkdtemp(join(tmpdir(), "pond-lifecycle-"));
  roots.push(parent);
  const root = join(parent, `${name}.pond`);
  await mkdir(root);
  await writeFile(
    join(root, "metadata.json"),
    JSON.stringify({ id: "library-id", name }),
  );
  return root;
}

it("builds a sibling pond path from a safe name", async () => {
  const source = await createLibrary("Before");
  expect(libraryPathForName(source, "After.pond")).toBe(
    join(dirname(source), "After.pond"),
  );
  expect(() => libraryPathForName(source, "../After")).toThrow(
    "without slashes or colons",
  );
});

it("renames the bundle and portable identity together", async () => {
  const source = await createLibrary("Before");
  const result = await renameLibraryBundle(source, "After");
  expect(result).toEqual({
    path: join(dirname(source), "After.pond"),
    previousName: "Before",
  });
  expect(existsSync(source)).toBe(false);
  expect(
    JSON.parse(await readFile(join(result.path, "metadata.json"), "utf8")),
  ).toMatchObject({ id: "library-id", name: "After" });
});

it("supports case-only folder renames", async () => {
  const source = await createLibrary("Before");
  const result = await renameLibraryBundle(source, "before");
  expect(result.path).toBe(join(dirname(source), "before.pond"));
  expect(
    JSON.parse(await readFile(join(result.path, "metadata.json"), "utf8")),
  ).toMatchObject({ name: "before" });
});

it("can roll back a renamed bundle", async () => {
  const source = await createLibrary("Before");
  const result = await renameLibraryBundle(source, "After");
  await rollbackLibraryRename(source, result.path, result.previousName);
  expect(existsSync(source)).toBe(true);
  expect(
    JSON.parse(await readFile(join(source, "metadata.json"), "utf8")),
  ).toMatchObject({ name: "Before" });
});

it("removes a source only after a distinct destination exists", async () => {
  const source = await createLibrary("Before");
  const destination = join(dirname(source), "After.pond");
  await mkdir(destination);
  await writeFile(join(destination, "metadata.json"), "{}");
  expect(await removeMovedLibrarySource(source, destination)).toBe(true);
  expect(existsSync(source)).toBe(false);
  expect(existsSync(destination)).toBe(true);
});
