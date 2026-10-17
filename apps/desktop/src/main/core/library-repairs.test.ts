import {
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inverse, type Transaction } from "@pond/schema/tx";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import type { LibraryIntegrityRuntime, RepairSave } from "./library-integrity";
import { createLibraryRepairService } from "./library-repairs";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function applySaveFiles(
  directory: string,
  transaction: Transaction,
): Promise<void> {
  if (transaction.model !== "save" || transaction.kind !== "update") {
    throw new Error("Expected a Save update");
  }
  for (const file of transaction.fileRenames ?? []) {
    await rename(join(directory, file.from), join(directory, file.to));
  }
  for (const file of transaction.files ?? []) {
    await writeFile(join(directory, file.filename), file.bytes);
  }
}

function createFixture() {
  let now = 1_000;
  let libraryId = "pond-a";
  let root = "/library-a";
  const runtime: LibraryIntegrityRuntime = {
    root: () => root,
    listSaves: async () => [
      {
        id: "empty-save",
        title: "Empty Save",
        source: "web",
        sourceId: "empty",
        url: "https://example.com/empty",
        files: [],
      },
    ],
    getSave: async () => null,
    inspectPayload: async () => ({
      ok: false,
      size: null,
      sha256: null,
      reason: "missing",
    }),
    canRenderThumbnail: async () => false,
    readInfo: async () => ({ status: "missing" }),
  };
  const service = createLibraryRepairService({
    now: () => now,
    libraryId: () => libraryId,
    root: () => root,
    integrityRuntime: runtime,
    commit: async () => {},
    recordUndo: () => {},
    repairMetadata: async () => {},
  });
  return {
    service,
    advance(milliseconds: number) {
      now += milliseconds;
    },
    switchLibrary() {
      libraryId = "pond-b";
      root = "/library-b";
    },
  };
}

describe("Library repair previews", () => {
  it("expires preview tokens before apply", async () => {
    const fixture = createFixture();
    const preview = await fixture.service.preview({
      kind: "invalid-content",
    });
    fixture.advance(10 * 60_000 + 1);

    await expect(
      fixture.service.apply({ token: preview.token }),
    ).rejects.toThrow("expired");
  });

  it("binds previews to the current Pond and Library root", async () => {
    const fixture = createFixture();
    const preview = await fixture.service.preview({
      kind: "invalid-content",
    });
    fixture.switchLibrary();

    await expect(
      fixture.service.apply({ token: preview.token }),
    ).rejects.toThrow("active Library changed");
  });

  it("rejects a target that disappeared after preview", async () => {
    const fixture = createFixture();
    const preview = await fixture.service.preview({
      kind: "invalid-content",
    });

    await expect(
      fixture.service.apply({ token: preview.token }),
    ).rejects.toThrow("changed");
  });

  it("moves invalid Saves to Trash and records one Undo batch", async () => {
    const row: RepairSave = {
      id: "empty-save",
      title: "Empty Save",
      source: "web",
      sourceId: "empty",
      url: "https://example.com/empty",
      files: [],
      deletedAt: null,
    };
    const committed: Transaction[][] = [];
    const undo: Transaction[][] = [];
    const runtime: LibraryIntegrityRuntime = {
      root: () => "/library",
      listSaves: async () => [row],
      getSave: async () => row,
      inspectPayload: async () => ({
        ok: false,
        size: null,
        sha256: null,
        reason: "missing",
      }),
      canRenderThumbnail: async () => false,
      readInfo: async () => ({ status: "missing" }),
    };
    const service = createLibraryRepairService({
      now: () => 1_000,
      libraryId: () => "pond",
      root: () => "/library",
      integrityRuntime: runtime,
      commit: async (transactions) => {
        committed.push(transactions);
      },
      recordUndo: (transactions) => {
        undo.push(transactions);
      },
      repairMetadata: async () => {},
    });
    const preview = await service.preview({ kind: "invalid-content" });

    const applied = await service.apply({ token: preview.token });

    expect(committed).toMatchObject([
      [
        {
          kind: "trash",
          model: "save",
          id: "empty-save",
        },
      ],
    ]);
    expect(undo).toHaveLength(1);
    expect(applied.result).toEqual({
      repaired: 1,
      skipped: 0,
      undoRecorded: true,
    });
  });

  it("replaces a damaged PNG thumbnail without orphaning it and restores it on Undo", async () => {
    const root = await mkdtemp(join(tmpdir(), "pond-thumbnail-repair-"));
    roots.push(root);
    const directory = join(root, "items", "save.info");
    await mkdir(directory, { recursive: true });
    const source = await sharp({
      create: {
        width: 80,
        height: 60,
        channels: 3,
        background: "#336699",
      },
    })
      .png()
      .toBuffer();
    const damaged = Buffer.from("damaged thumbnail");
    await writeFile(join(directory, "image.png"), source);
    await writeFile(join(directory, "image.png_thumbnail.png"), damaged);
    const row: RepairSave = {
      id: "save",
      title: "Save",
      source: "local",
      sourceId: "save",
      url: "",
      deletedAt: null,
      files: [
        {
          kind: "image",
          path: "image.png",
          size: source.byteLength,
          sha256: "source",
        },
        {
          kind: "thumbnail",
          path: "image.png_thumbnail.png",
          size: damaged.byteLength,
          sha256: "damaged",
        },
      ],
    };
    const committed: Transaction[][] = [];
    const runtime: LibraryIntegrityRuntime = {
      root: () => root,
      listSaves: async () => [row],
      getSave: async () => row,
      inspectPayload: async () => ({
        ok: true,
        size: 1,
        sha256: "observed",
        reason: "ok",
      }),
      canRenderThumbnail: async (path) => path.endsWith("image.png"),
      readInfo: async () => ({ status: "missing" }),
    };
    const service = createLibraryRepairService({
      now: () => 1_000,
      libraryId: () => "pond",
      root: () => root,
      integrityRuntime: runtime,
      commit: async (transactions) => {
        for (const transaction of transactions) {
          await applySaveFiles(directory, transaction);
        }
        committed.push(transactions);
      },
      recordUndo: () => {},
      repairMetadata: async () => {},
    });

    const preview = await service.preview({ kind: "thumbnails" });
    await service.apply({ token: preview.token });

    const transaction = committed[0]?.[0];
    if (!transaction) throw new Error("Missing repair transaction");
    expect(transaction).toMatchObject({
      fileRenames: [
        {
          from: "image.png_thumbnail.png",
          to: "image.png_thumbnail.webp",
        },
      ],
      beforeFiles: [{ filename: "image.png_thumbnail.png", bytes: damaged }],
    });
    await expect(
      readFile(join(directory, "image.png_thumbnail.png")),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(
      // A buffer keeps sharp from holding the file open, which blocks the Undo rename on Windows.
      (
        await sharp(
          await readFile(join(directory, "image.png_thumbnail.webp")),
        ).metadata()
      ).format,
    ).toBe("webp");

    await applySaveFiles(directory, inverse(transaction));
    expect(await readFile(join(directory, "image.png_thumbnail.png"))).toEqual(
      damaged,
    );
    await expect(
      readFile(join(directory, "image.png_thumbnail.webp")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
