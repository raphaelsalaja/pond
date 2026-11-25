import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import yauzl from "yauzl";
import { zipDirectory } from "./export-zip";

const roots: Array<string> = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function readText(stream: Readable): Promise<string> {
  const chunks: Array<Buffer> = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function entries(path: string): Promise<Map<string, string>> {
  return new Promise((done, fail) => {
    yauzl.open(path, { lazyEntries: true }, (error, zip) => {
      if (error) return fail(error);
      const found = new Map<string, string>();
      zip.on("entry", (entry: yauzl.Entry) => {
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError) {
            return fail(streamError);
          }
          void readText(stream).then((text) => {
            found.set(entry.fileName, text);
            zip.readEntry();
          }, fail);
        });
      });
      zip.on("end", () => done(found));
      zip.on("error", fail);
      zip.readEntry();
    });
  });
}

describe("zip directory", () => {
  it("keeps the export folder as the archive's top level", async () => {
    const root = await mkdtemp(join(tmpdir(), "pond-export-zip-"));
    roots.push(root);
    const source = join(root, "Geoid (Pond Export 2026-11-22)");
    await mkdir(join(source, "Sketches"), { recursive: true });
    await writeFile(join(source, "pond-export.json"), "{}");
    await writeFile(join(source, "Sketches", "Sketch.jpg"), "sketch");
    const destination = join(root, "Geoid (Pond Export 2026-11-22).zip");
    await zipDirectory(source, destination);
    expect(await entries(destination)).toEqual(
      new Map([
        ["Geoid (Pond Export 2026-11-22)/Sketches/Sketch.jpg", "sketch"],
        ["Geoid (Pond Export 2026-11-22)/pond-export.json", "{}"],
      ]),
    );
    expect(await readdir(root)).not.toContain(
      "Geoid (Pond Export 2026-11-22).zip.partial",
    );
  });
});
