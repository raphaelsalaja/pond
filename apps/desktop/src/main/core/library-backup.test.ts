import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isWindowsSymlinkPrivilegeError } from "../test/symlink";
import {
  createLibraryBackup,
  restoreLibraryBackup,
  verifyLibraryBackup,
} from "./library-backup";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "pond-backup-test-"));
  roots.push(root);
  const source = join(root, "Source.pond");
  const item = join(source, "items", "save.info");
  await mkdir(item, { recursive: true });
  const bytes = Buffer.from("original image bytes");
  await writeFile(
    join(source, "metadata.json"),
    JSON.stringify({ id: "library", name: "Source" }),
  );
  await writeFile(join(item, "original.jpg"), bytes);
  await writeFile(
    join(item, "info.json"),
    JSON.stringify({
      id: "save",
      files: [
        {
          path: "original.jpg",
          size: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        },
      ],
    }),
  );
  return { root, source, item, destination: join(root, "Backup.pond") };
}

describe("verified library backup", () => {
  it("publishes a verified portable copy and validates its original files", async () => {
    const { source, destination } = await fixture();
    const result = await createLibraryBackup({ source, destination });
    expect(result.copied).toBe(3);
    expect(await verifyLibraryBackup(destination)).toEqual({
      files: 3,
      verifiedManifest: true,
    });
    expect(
      await readFile(
        join(destination, "items", "save.info", "original.jpg"),
        "utf8",
      ),
    ).toBe("original image bytes");
  });

  it("restores a separate editable library while leaving the verified snapshot untouched", async () => {
    const { root, source, destination } = await fixture();
    await createLibraryBackup({ source, destination });
    const restored = join(root, "Restored.pond");
    expect(
      (
        await restoreLibraryBackup({
          source: destination,
          destination: restored,
        })
      ).copied,
    ).toBe(3);
    await writeFile(
      join(restored, "metadata.json"),
      JSON.stringify({ id: "library", name: "Restored" }),
    );
    expect((await verifyLibraryBackup(destination)).verifiedManifest).toBe(
      true,
    );
    expect((await verifyLibraryBackup(restored)).verifiedManifest).toBe(false);
    expect(
      JSON.parse(await readFile(join(destination, "metadata.json"), "utf8"))
        .name,
    ).toBe("Source");
  });

  it("detects source edits during copying and never publishes a partial backup", async () => {
    const { root, source, destination } = await fixture();
    await expect(
      createLibraryBackup({
        source,
        destination,
        async onProgress(copied) {
          if (copied === 1)
            await writeFile(
              join(source, "metadata.json"),
              JSON.stringify({ id: "library", name: "Changed" }),
            );
        },
      }),
    ).rejects.toThrow("changed during backup");
    expect(await readdir(root)).toEqual(["Source.pond"]);
  });

  it("rejects damaged originals before publishing and detects later backup corruption", async () => {
    const { source, destination } = await fixture();
    await createLibraryBackup({ source, destination });
    await writeFile(
      join(destination, "items", "save.info", "original.jpg"),
      "damaged",
    );
    await expect(verifyLibraryBackup(destination)).rejects.toThrow(
      "missing or damaged",
    );
    await expect(
      createLibraryBackup({
        source: destination,
        destination: `${destination}-again`,
      }),
    ).rejects.toThrow("missing or damaged");
  });

  it("refuses destinations inside or around the source library", async () => {
    const { root, source } = await fixture();
    const nested = join(source, "Backup.pond");
    await expect(
      createLibraryBackup({ source, destination: nested }),
    ).rejects.toThrow("outside the source library");
    await expect(
      createLibraryBackup({ source, destination: root }),
    ).rejects.toThrow("outside the source library");
    expect(await readdir(source)).not.toContain("Backup.pond");
  });

  it("does not overwrite an occupied destination", async () => {
    const { source, destination } = await fixture();
    await mkdir(destination);
    await writeFile(join(destination, "important.txt"), "keep");
    await expect(createLibraryBackup({ source, destination })).rejects.toThrow(
      "already contains files",
    );
    expect(await readFile(join(destination, "important.txt"), "utf8")).toBe(
      "keep",
    );
  });

  it("rejects library symlinks rather than copying external data", async (ctx) => {
    const { root, source, destination } = await fixture();
    const outside = join(root, "outside.txt");
    await writeFile(outside, "external");
    try {
      await symlink(outside, join(source, "external.txt"));
    } catch (error) {
      if (error instanceof Error && isWindowsSymlinkPrivilegeError(error)) {
        ctx.skip("Windows symlink privilege is unavailable");
        return;
      }
      throw error;
    }
    await expect(createLibraryBackup({ source, destination })).rejects.toThrow(
      "symbolic link",
    );
  });
});
