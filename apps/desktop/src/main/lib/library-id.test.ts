import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  LibraryMetadataError,
  readLibraryId,
  readOrCreateLibraryId,
} from "./library-id";

const roots: Array<string> = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function tempLibrary(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "library-id-"));
  roots.push(parent);
  const root = join(parent, "Studio.pond");
  await mkdir(root);
  return root;
}

it("creates metadata with a new id when metadata.json is missing", async () => {
  const root = await tempLibrary();
  const id = readOrCreateLibraryId(root);
  const stored = JSON.parse(
    await readFile(join(root, "metadata.json"), "utf8"),
  );
  expect(stored.id).toBe(id);
  expect(readOrCreateLibraryId(root)).toBe(id);
});

it("returns the stored id from valid metadata", async () => {
  const root = await tempLibrary();
  await writeFile(
    join(root, "metadata.json"),
    JSON.stringify({ id: "library-1", name: "Studio" }),
  );
  expect(readOrCreateLibraryId(root)).toBe("library-1");
  expect(readLibraryId(root)).toBe("library-1");
});

it.each([
  ["invalid JSON", "{ not json"],
  ["metadata without an id", JSON.stringify({ name: "Studio" })],
])("throws and leaves the file untouched for %s", async (_label, body) => {
  const root = await tempLibrary();
  const file = join(root, "metadata.json");
  await writeFile(file, body);

  const error = captureError(() => readOrCreateLibraryId(root));

  expect(error).toBeInstanceOf(LibraryMetadataError);
  expect(error).toMatchObject({
    file,
    message:
      "metadata.json in Studio is unreadable. Restore it from a backup or choose another Library.",
  });
  expect(await readFile(file, "utf8")).toBe(body);
});

it("throws when metadata.json cannot be read", async () => {
  const root = await tempLibrary();
  await mkdir(join(root, "metadata.json"));
  expect(() => readOrCreateLibraryId(root)).toThrow(LibraryMetadataError);
});

it("reports a missing metadata.json without creating one", async () => {
  const root = await tempLibrary();
  expect(readLibraryId(root)).toBeNull();
  await expect(readFile(join(root, "metadata.json"))).rejects.toThrow();
});

it("throws instead of returning an id it could not persist", async () => {
  const root = await tempLibrary();
  const blocker = join(root, "file");
  await writeFile(blocker, "");
  expect(() => readOrCreateLibraryId(join(blocker, "library"))).toThrow();
});

function captureError(run: () => void): Error | null {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error : null;
  }
  return null;
}
