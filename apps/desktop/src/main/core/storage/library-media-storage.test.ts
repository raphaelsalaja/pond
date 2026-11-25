import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  libraryMediaMetadata,
  readLibraryMedia,
  readLibraryMediaRange,
  writeLibraryMedia,
} from "./library-media-storage";

const roots: Array<string> = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "pond-media-"));
  roots.push(root);
  return root;
}

async function collect(chunks: AsyncIterable<Buffer>): Promise<Buffer> {
  const values: Array<Buffer> = [];
  for await (const chunk of chunks) {
    values.push(chunk);
  }
  return Buffer.concat(values);
}

describe("Library media storage", () => {
  it("writes plaintext and serves byte ranges", async () => {
    const root = await createRoot();
    const file = join(root, "image.bin");
    const bytes = Buffer.from("Pond media storage fixture bytes");
    await writeLibraryMedia(file, bytes);
    expect(await readFile(file)).toEqual(bytes);
    expect(await libraryMediaMetadata(file)).toEqual({
      originalSize: bytes.byteLength,
    });
    expect(
      await collect(
        readLibraryMediaRange({ path: file, start: 7, endExclusive: 19 }),
      ),
    ).toEqual(bytes.subarray(7, 19));
    expect(
      await collect(
        readLibraryMediaRange({ path: file, start: 4, endExclusive: 4 }),
      ),
    ).toEqual(Buffer.alloc(0));
    expect(await readLibraryMedia(file)).toEqual(bytes);
  });
});
