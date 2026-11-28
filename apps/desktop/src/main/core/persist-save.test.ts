import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saves } from "@pond/schema/db";
import type { RawJson } from "@pond/schema/raw";
import { StoredRawJsonSchema } from "@pond/schema/raw-schema";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { app } from "electron";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getDb } from "../db";
import { SOURCE_FILE } from "../lib/library-format";
import { invalidatePaths, resolvePaths, saveDir } from "../paths";
import { withMutationScope } from "./executor";
import { persistSave } from "./persist-save";

function nativeSqliteAvailable(): boolean {
  try {
    new Database(":memory:").close();
    return true;
  } catch (error) {
    if (process.versions.electron) throw error;
    return false;
  }
}

async function seedSave(id: string): Promise<void> {
  const db = await getDb();
  db.insert(saves)
    .values({ id, source: "web", sourceId: id, url: "https://example.com/" })
    .run();
}

describe.skipIf(!nativeSqliteAvailable())("persistSave files", () => {
  let directory = "";

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), "pond-persist-save-"));
    app.setPath("userData", directory);
    invalidatePaths();
    resolvePaths(join(directory, "Files.pond"));
  });

  afterEach(() => {
    closeDb();
    invalidatePaths();
    rmSync(directory, { recursive: true, force: true });
  });

  it("moves written files into the Save with their hash and leaves nothing staged", async () => {
    await seedSave("save");
    const bytes = Buffer.from("image bytes");

    const updated = await persistSave(
      "save",
      {},
      {
        actorReason: "test",
        newFiles: [{ kind: "image", filename: "image.png", bytes }],
      },
    );

    expect(updated?.files).toEqual([
      {
        kind: "image",
        path: "image.png",
        sha256: createHash("sha256").update(bytes).digest("hex"),
        size: bytes.byteLength,
      },
    ]);
    expect(readFileSync(join(saveDir("save"), "image.png"))).toEqual(bytes);
    expect(
      readdirSync(saveDir("save")).filter((name) => name.startsWith(".pond-")),
    ).toEqual([]);
  });

  it("writes a rawJson-only patch to source.json when writeInfo is requested", async () => {
    await seedSave("save");
    const rawJson: RawJson = {
      extractorId: "test",
      extractedAt: "2026-11-16T00:00:00.000Z",
      capture: {
        id: "9",
        source: "twitter",
        url: "https://x.com/alice/status/9",
        media: [],
      },
      postCardProvenance: {
        light: { renderer: "react", captureTweetVersion: 13 },
        dark: { renderer: "screenshot", captureTweetVersion: 13 },
      },
    };

    await persistSave(
      "save",
      { rawJson },
      { actorReason: "test", writeInfo: true },
    );

    const source = StoredRawJsonSchema.parse(
      JSON.parse(readFileSync(join(saveDir("save"), SOURCE_FILE), "utf8")),
    );
    expect(source.postCardProvenance).toEqual(rawJson.postCardProvenance);
  });

  it("lets other edits run while a Save's files are being written", async () => {
    await seedSave("save");
    const db = await getDb();
    const filesSeenByEdit: Array<unknown> = [];

    const writing = persistSave(
      "save",
      {},
      {
        actorReason: "test",
        newFiles: [
          {
            kind: "image",
            filename: "large.png",
            bytes: Buffer.alloc(8 * 1024 * 1024, 1),
          },
        ],
      },
    );
    await withMutationScope(async () => {
      filesSeenByEdit.push(
        db.select().from(saves).where(eq(saves.id, "save")).get()?.files,
      );
    });
    const updated = await writing;

    /** The edit ran before the write committed, so it never waited on the copy. */
    expect(filesSeenByEdit).toEqual([[]]);
    expect(updated?.files).toHaveLength(1);
  });

  it("removes staged files when the Save is gone", async () => {
    await seedSave("save");
    const db = await getDb();
    const writing = persistSave(
      "save",
      {},
      {
        actorReason: "test",
        newFiles: [
          { kind: "image", filename: "image.png", bytes: Buffer.from("x") },
        ],
      },
    );
    db.delete(saves).where(eq(saves.id, "save")).run();

    expect(await writing).toBeNull();
    expect(readdirSync(saveDir("save"))).toEqual([]);
  });
});
