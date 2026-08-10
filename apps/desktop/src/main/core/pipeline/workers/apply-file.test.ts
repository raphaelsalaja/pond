import { createHash } from "node:crypto";
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { persistWriteFile } from "./apply";

const temporaryDirectories: string[] = [];

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "pond-apply-file-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        recursive: true,
        force: true,
      }),
    ),
  );
});

describe("persistWriteFile", () => {
  it("copies a source path and computes its size and SHA-256", async () => {
    const directory = await temporaryDirectory();
    const sourcePath = join(directory, "source.bin");
    const targetPath = join(directory, "saved.bin");
    const contents = Buffer.from("a source-backed file");
    await writeFile(sourcePath, contents);

    const result = await persistWriteFile(
      {
        kind: "other",
        filename: "saved.bin",
        sourcePath,
      },
      targetPath,
    );

    expect(result).toEqual({
      size: contents.byteLength,
      sha256: createHash("sha256").update(contents).digest("hex"),
    });
    expect(await readFile(targetPath)).toEqual(contents);
    expect((await stat(sourcePath)).size).toBe(contents.byteLength);
  });

  it("keeps byte-backed callers compatible", async () => {
    const directory = await temporaryDirectory();
    const targetPath = join(directory, "saved.bin");

    const result = await persistWriteFile(
      {
        kind: "other",
        filename: "saved.bin",
        bytes: Buffer.from("bytes"),
      },
      targetPath,
    );

    expect(result?.size).toBe(5);
    expect(await readFile(targetPath, "utf8")).toBe("bytes");
  });

  it("does not retain an empty copied output", async () => {
    const directory = await temporaryDirectory();
    const sourcePath = join(directory, "empty.bin");
    const targetPath = join(directory, "saved.bin");
    await writeFile(sourcePath, "");

    expect(
      await persistWriteFile(
        { kind: "other", filename: "saved.bin", sourcePath },
        targetPath,
      ),
    ).toBeNull();
    await expect(stat(targetPath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
