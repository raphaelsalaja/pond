import { describe, expect, it, type TestContext } from "vitest";
import { embeddingDimensions } from "../../shared/embeddings";
import {
  backfillVecBatch,
  ensureVecTables,
  knnVec,
  loadSqliteVec,
  parseJsonVector,
  toVecBlob,
  upsertVec,
} from "./vec-index";

/**
 * better-sqlite3 is built for Electron's ABI, so plain Node usually cannot load it.
 * That skips these tests visibly; Electron, or POND_REQUIRE_NATIVE=1, makes it a failure.
 */
const nativeRequired =
  Boolean(process.versions.electron) || process.env.POND_REQUIRE_NATIVE === "1";

async function openMemoryDb(context: TestContext) {
  try {
    const Database = (await import("better-sqlite3")).default;
    return new Database(":memory:");
  } catch (error) {
    if (nativeRequired) throw error;
    context.skip(
      "better-sqlite3 cannot load under plain Node (set POND_REQUIRE_NATIVE=1 to require it)",
    );
    throw error;
  }
}

describe("vec-index packing", () => {
  it("serializes floats as a 4-byte-per-dim blob", () => {
    const blob = toVecBlob([1, 0, 0, 0]);
    expect(blob.length).toBe(16);
    expect(new Float32Array(blob.buffer, blob.byteOffset, 4)[0]).toBe(1);
  });

  it("parses JSON arrays and rejects mixed payloads", () => {
    expect(parseJsonVector("[0.1,0.2]")).toEqual([0.1, 0.2]);
    expect(parseJsonVector([0.1, 0.2])).toEqual([0.1, 0.2]);
    expect(parseJsonVector("[")).toBeNull();
    expect(parseJsonVector(["x"])).toBeNull();
  });
});

describe("vec-index knn", () => {
  it("ranks the nearest neighbor in sqlite-vec", async (context) => {
    const db = await openMemoryDb(context);
    expect(loadSqliteVec(db)).toBe(true);
    ensureVecTables(db, { text: 4, clip: 4 });
    upsertVec(db, "text", "near", [1, 0, 0, 0]);
    upsertVec(db, "text", "far", [0, 1, 0, 0]);
    const hits = knnVec(db, "text", [1, 0, 0, 0], 2);
    expect(hits[0]?.id).toBe("near");
    expect(hits[0]?.distance).toBe(0);
    expect(knnVec(db, "text", [1, 0, 0], 2)).toEqual([]);
    expect(knnVec(db, "text", [1, 0, 0, 0, 0], 2)).toEqual([]);
    db.close();
  });

  it("backfills JSON embeddings into vec0", async (context) => {
    const db = await openMemoryDb(context);
    expect(loadSqliteVec(db)).toBe(true);
    db.exec(`
      CREATE TABLE saves (
        id TEXT PRIMARY KEY,
        embedding TEXT,
        clip_embedding TEXT
      );
    `);
    db.prepare(
      "INSERT INTO saves(id, embedding, clip_embedding) VALUES (?, ?, ?)",
    ).run("cat", JSON.stringify([1, 0, 0, 0]), null);
    ensureVecTables(db, { text: 4, clip: 4 });
    const result = backfillVecBatch(db);
    expect(result.processed).toBe(1);
    expect(knnVec(db, "text", [1, 0, 0, 0], 1)[0]?.id).toBe("cat");
    db.close();
  });

  it("keeps embedding-sized tables when reopened with defaults", async (context) => {
    const db = await openMemoryDb(context);
    expect(loadSqliteVec(db)).toBe(true);
    const vector = Array.from({ length: embeddingDimensions() }, (_, index) =>
      index === 0 ? 1 : 0,
    );
    ensureVecTables(db);
    upsertVec(db, "text", "text-save", vector);
    upsertVec(db, "clip", "media-save", vector);
    ensureVecTables(db);
    expect(knnVec(db, "text", vector, 1)[0]?.id).toBe("text-save");
    expect(knnVec(db, "clip", vector, 1)[0]?.id).toBe("media-save");
    db.close();
  });
});
