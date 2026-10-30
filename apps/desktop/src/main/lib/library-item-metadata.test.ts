import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { saveDirIn } from "../paths";
import { readSaveMetadata } from "./library";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function writeInfo(
  root: string,
  id: string,
  info: Record<string, string>,
) {
  await mkdir(saveDirIn(root, id), { recursive: true });
  await writeFile(
    join(saveDirIn(root, id), "info.json"),
    JSON.stringify({ id, url: `pond:local/${id}`, ...info }),
  );
}

it("distinguishes a missing info.json from a corrupt one", async () => {
  const root = await mkdtemp(join(tmpdir(), "pond-item-metadata-"));
  roots.push(root);
  expect(await readSaveMetadata("absent", root)).toEqual({
    status: "missing",
  });

  await mkdir(saveDirIn(root, "broken"), { recursive: true });
  await writeFile(join(saveDirIn(root, "broken"), "info.json"), "{not json");
  expect(await readSaveMetadata("broken", root)).toMatchObject({
    status: "corrupt",
  });
});

it("reads where a save was imported from, falling back to legacy source ids", async () => {
  const root = await mkdtemp(join(tmpdir(), "pond-item-metadata-"));
  roots.push(root);
  await writeInfo(root, "stored", {
    source: "twitter",
    sourceId: "1",
    importedFrom: "data-export",
  });
  await writeInfo(root, "legacy", { source: "local", sourceId: "eagle:ABC" });
  await writeInfo(root, "own", { source: "local", sourceId: "own" });
  await writeInfo(root, "unknown", {
    source: "local",
    sourceId: "x",
    importedFrom: "somewhere",
  });

  const origin = async (id: string) => {
    const read = await readSaveMetadata(id, root);
    return read.status === "ok" ? read.metadata.importedFrom : read.status;
  };
  expect(await origin("stored")).toBe("data-export");
  expect(await origin("legacy")).toBe("eagle");
  expect(await origin("own")).toBeNull();
  expect(await origin("unknown")).toBeNull();
});
