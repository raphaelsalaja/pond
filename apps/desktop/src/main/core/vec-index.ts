import { existsSync } from "node:fs";
import { join } from "node:path";
import { arch, platform } from "node:process";
import type { JsonValue } from "@pond/schema/json";
import type Database from "better-sqlite3";
import log from "electron-log/main.js";
import { load as loadSqliteVecExtension } from "sqlite-vec";
import { z } from "zod";
import { embeddingDimensions } from "../../shared/embeddings";

const TEXT_VEC_TABLE = "save_text_vec";
const CLIP_VEC_TABLE = "save_clip_vec";
const DEFAULT_TEXT_DIM = embeddingDimensions();
const DEFAULT_CLIP_DIM = embeddingDimensions();

export type VecKind = "text" | "clip";

const TABLES = {
  text: TEXT_VEC_TABLE,
  clip: CLIP_VEC_TABLE,
} satisfies Record<VecKind, string>;

const DimRowSchema = z.object({ dimensions: z.number() }).optional();
const VectorRowsSchema = z.array(
  z.object({ id: z.string(), embedding: z.string() }),
);
const NeighborRowsSchema = z.array(
  z.object({ id: z.string(), distance: z.number() }),
);
const VectorSchema = z.array(z.number());

export function toVecBlob(vector: ArrayLike<number>): Buffer {
  return Buffer.from(Float32Array.from(vector).buffer);
}

export function parseJsonVector(
  raw: JsonValue | undefined,
): Array<number> | null {
  const direct = VectorSchema.safeParse(raw);
  if (direct.success) return direct.data;
  const text = z.string().safeParse(raw);
  if (!text.success || !text.data) return null;
  try {
    const decoded = VectorSchema.safeParse(JSON.parse(text.data));
    return decoded.success ? decoded.data : null;
  } catch {
    return null;
  }
}

export function loadSqliteVec(db: Database.Database): boolean {
  const unpacked = unpackedExtensionPath();
  if (unpacked) {
    try {
      db.loadExtension(unpacked);
      return true;
    } catch (error) {
      log.warn("[pond vec] unpacked extension failed", {
        error: error instanceof Error ? error.message : "unknown error",
      });
    }
  }
  try {
    loadSqliteVecExtension(db);
    return true;
  } catch (error) {
    log.warn("[pond vec] sqlite-vec unavailable", {
      error: error instanceof Error ? error.message : "unknown error",
    });
    return false;
  }
}

function unpackedExtensionPath(): string | null {
  const resourcesPath = process.resourcesPath;
  if (!resourcesPath) return null;
  const ext =
    platform === "darwin" ? "dylib" : platform === "win32" ? "dll" : "so";
  const os = platform === "win32" ? "windows" : platform;
  const candidate = join(
    resourcesPath,
    "app.asar.unpacked",
    "node_modules",
    `sqlite-vec-${os}-${arch}`,
    `vec0.${ext}`,
  );
  return existsSync(candidate) ? candidate : null;
}

export function ensureVecTables(
  db: Database.Database,
  dims: { text: number; clip: number } = {
    text: DEFAULT_TEXT_DIM,
    clip: DEFAULT_CLIP_DIM,
  },
): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS vec_meta (
      kind TEXT PRIMARY KEY,
      dimensions INTEGER NOT NULL
    );
  `);
  ensureKind(db, "text", dims.text);
  ensureKind(db, "clip", dims.clip);
}

function ensureVecDim(
  db: Database.Database,
  kind: VecKind,
  dimensions: number,
): void {
  if (dimensions < 1) return;
  ensureKind(db, kind, dimensions);
}

function ensureKind(
  db: Database.Database,
  kind: VecKind,
  dimensions: number,
): void {
  const table = TABLES[kind];
  const row = DimRowSchema.parse(
    db.prepare("SELECT dimensions FROM vec_meta WHERE kind = ?").get(kind),
  );
  if (row?.dimensions !== dimensions) {
    db.exec(`DROP TABLE IF EXISTS ${table}`);
  }
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS ${table} USING vec0(
      save_id TEXT PRIMARY KEY,
      embedding FLOAT[${dimensions}]
    );
  `);
  db.prepare(
    `INSERT INTO vec_meta(kind, dimensions) VALUES (?, ?)
     ON CONFLICT(kind) DO UPDATE SET dimensions = excluded.dimensions`,
  ).run(kind, dimensions);
}

function currentVecDim(db: Database.Database, kind: VecKind): number | null {
  const row = DimRowSchema.parse(
    db.prepare("SELECT dimensions FROM vec_meta WHERE kind = ?").get(kind),
  );
  return row?.dimensions ?? null;
}

export function upsertVec(
  db: Database.Database,
  kind: VecKind,
  saveId: string,
  vector: ArrayLike<number>,
): boolean {
  if (!saveId || vector.length < 1) return false;
  ensureVecDim(db, kind, vector.length);
  const table = TABLES[kind];
  const blob = toVecBlob(vector);
  db.prepare(`DELETE FROM ${table} WHERE save_id = ?`).run(saveId);
  db.prepare(`INSERT INTO ${table}(save_id, embedding) VALUES (?, ?)`).run(
    saveId,
    blob,
  );
  return true;
}

export function knnVec(
  db: Database.Database,
  kind: VecKind,
  vector: ArrayLike<number>,
  k: number,
): Array<{ id: string; distance: number }> {
  try {
    const dimensions = currentVecDim(db, kind);
    if (!dimensions || vector.length !== dimensions || k < 1) return [];
    const table = TABLES[kind];
    return NeighborRowsSchema.parse(
      db
        .prepare(
          `SELECT save_id AS id, distance FROM ${table} WHERE embedding MATCH ? AND k = ?`,
        )
        .all(toVecBlob(vector), k),
    );
  } catch (error) {
    log.warn("[pond vec] knn failed", {
      kind,
      error: error instanceof Error ? error.message : "unknown error",
    });
    return [];
  }
}

const BACKFILL_BATCH = 200;

export function backfillVecBatch(db: Database.Database) {
  const textDim = currentVecDim(db, "text") ?? DEFAULT_TEXT_DIM;
  const clipDim = currentVecDim(db, "clip") ?? DEFAULT_CLIP_DIM;
  const textRows = VectorRowsSchema.parse(
    db
      .prepare(
        `SELECT id, embedding FROM saves
       WHERE embedding IS NOT NULL
         AND id NOT IN (SELECT save_id FROM ${TEXT_VEC_TABLE})
       LIMIT ?`,
      )
      .all(BACKFILL_BATCH),
  );
  const clipRows = VectorRowsSchema.parse(
    db
      .prepare(
        `SELECT id, clip_embedding AS embedding FROM saves
       WHERE clip_embedding IS NOT NULL
         AND id NOT IN (SELECT save_id FROM ${CLIP_VEC_TABLE})
       LIMIT ?`,
      )
      .all(BACKFILL_BATCH),
  );

  let processed = 0;
  for (const row of textRows) {
    const vector = parseJsonVector(row.embedding);
    if (
      vector &&
      vector.length === textDim &&
      upsertVec(db, "text", row.id, vector)
    ) {
      processed += 1;
    }
  }
  for (const row of clipRows) {
    const vector = parseJsonVector(row.embedding);
    if (
      vector &&
      vector.length === clipDim &&
      upsertVec(db, "clip", row.id, vector)
    ) {
      processed += 1;
    }
  }
  return {
    processed,
    hasMore:
      textRows.length === BACKFILL_BATCH || clipRows.length === BACKFILL_BATCH,
  };
}

export function ensureVecDeleteTrigger(db: Database.Database): void {
  db.exec(`
    DROP TRIGGER IF EXISTS saves_vec_ad;
    CREATE TRIGGER saves_vec_ad AFTER DELETE ON saves BEGIN
      DELETE FROM ${TEXT_VEC_TABLE} WHERE save_id = old.id;
      DELETE FROM ${CLIP_VEC_TABLE} WHERE save_id = old.id;
    END;
  `);
}
