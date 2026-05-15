import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as schema from "@pond/schema/db";
import { registerSqliteFunctions } from "@pond/schema/filters";
import Database from "better-sqlite3";
import { sql } from "drizzle-orm";
import {
  type BetterSQLite3Database,
  drizzle,
} from "drizzle-orm/better-sqlite3";
import log from "electron-log/main.js";
import {
  DEFAULT_LIBRARY_NAME,
  LIBRARY_SCHEMA_VERSION,
} from "../shared/constants";
import { resolvePaths } from "./paths";

export type Db = BetterSQLite3Database<typeof schema> & {
  $raw: Database.Database;
};

let cached: Db | null = null;

export async function getDb(): Promise<Db> {
  if (cached) return cached;

  const paths = resolvePaths();
  log.info("[pond db] opening", paths.indexDb);

  const sqlite = new Database(paths.indexDb);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("temp_store = MEMORY");
  sqlite.pragma("mmap_size = 268435456"); // 256 MiB

  try {
    const { load } = await import("sqlite-vec");
    load(sqlite);
    log.info("[pond db] sqlite-vec loaded");
  } catch (err) {
    log.warn(
      "[pond db] sqlite-vec not available — semantic search disabled",
      err,
    );
  }

  registerSqliteFunctions(sqlite);

  migrate(sqlite);

  const drizzled = drizzle(sqlite, { schema });
  const db = Object.assign(drizzled, { $raw: sqlite }) as Db;
  cached = db;

  await ensureLibraryMetadata();

  return db;
}

function migrate(sqlite: Database.Database): void {
  sqlite.exec(`
		CREATE TABLE IF NOT EXISTS saves (
			id TEXT PRIMARY KEY,
			source TEXT NOT NULL,
			source_id TEXT NOT NULL,
			url TEXT NOT NULL,
			title TEXT,
			description TEXT,
			author TEXT,
			lang TEXT,
			site_name TEXT,
			published_at INTEGER,
			notes TEXT,
			media_url TEXT,
			media_type TEXT,
			raw_json TEXT,
			tags TEXT NOT NULL DEFAULT '[]',
			ai_tags TEXT NOT NULL DEFAULT '[]',
			ai_caption TEXT,
			ai_suggestions TEXT,
			classification TEXT,
			ai_summary TEXT,
			article_html TEXT,
			article_text TEXT,
			article_reading_minutes INTEGER,
			annotations TEXT,
			ocr_text TEXT,
			dominant_colors TEXT,
			blur_data_url TEXT,
			nsfw_score REAL,
			nsfw_label TEXT,
			files TEXT NOT NULL DEFAULT '[]',
			cover_index INTEGER NOT NULL DEFAULT 0,
			width INTEGER,
			height INTEGER,
			file_size INTEGER,
			archived_at INTEGER,
			deleted_at INTEGER,
			embedding_updated_at INTEGER,
			saved_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
			UNIQUE(source, source_id)
		);

		CREATE INDEX IF NOT EXISTS saves_saved_at_idx ON saves(saved_at);
		CREATE INDEX IF NOT EXISTS saves_source_idx ON saves(source);
		CREATE INDEX IF NOT EXISTS saves_size_idx ON saves(file_size);
		CREATE INDEX IF NOT EXISTS saves_dims_idx ON saves(width, height);
		CREATE INDEX IF NOT EXISTS saves_archived_idx ON saves(archived_at);
		CREATE INDEX IF NOT EXISTS saves_deleted_idx ON saves(deleted_at);

		CREATE TABLE IF NOT EXISTS tags (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL UNIQUE,
			color TEXT,
			"group" TEXT,
			usage_count INTEGER NOT NULL DEFAULT 0,
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
		);
		CREATE INDEX IF NOT EXISTS tags_group_idx ON tags("group");

		CREATE TABLE IF NOT EXISTS sync_actions (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			batch_id TEXT,
			model_name TEXT NOT NULL,
			model_id TEXT NOT NULL,
			action TEXT NOT NULL,
			data TEXT,
			prev_data TEXT,
			actor TEXT NOT NULL,
			actor_reason TEXT,
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
		);
		CREATE INDEX IF NOT EXISTS sync_actions_model_idx ON sync_actions(model_name, model_id, id);
		CREATE INDEX IF NOT EXISTS sync_actions_actor_idx ON sync_actions(actor, id);
		CREATE INDEX IF NOT EXISTS sync_actions_batch_idx ON sync_actions(batch_id);

		CREATE TABLE IF NOT EXISTS library_scan (
			item_id TEXT PRIMARY KEY,
			mtime_ms INTEGER NOT NULL,
			scanned_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
		);

		CREATE TABLE IF NOT EXISTS settings (
			id TEXT PRIMARY KEY DEFAULT 'singleton',
			ai_autonomy TEXT NOT NULL,
			ai_provider TEXT,
			video_download TEXT NOT NULL DEFAULT '{"enabled":true,"maxHeight":1080,"maxFileSizeMb":500}',
			prefs TEXT,
			library_root TEXT,
			onboarded INTEGER NOT NULL DEFAULT 0,
			updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
		);

		CREATE TABLE IF NOT EXISTS enrich_jobs (
			id TEXT PRIMARY KEY,
			save_id TEXT NOT NULL,
			kind TEXT NOT NULL,
			state TEXT NOT NULL DEFAULT 'pending',
			attempts INTEGER NOT NULL DEFAULT 0,
			last_error TEXT,
			next_attempt_at INTEGER NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
			updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
			UNIQUE(save_id, kind)
		);
		CREATE INDEX IF NOT EXISTS enrich_jobs_state_idx ON enrich_jobs(state);
		CREATE INDEX IF NOT EXISTS enrich_jobs_next_idx ON enrich_jobs(next_attempt_at);
	`);

  sqlite.exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS saves_fts USING fts5(
			id UNINDEXED,
			title,
			description,
			author,
			ocr_text,
			ai_caption,
			ai_summary,
			article_text,
			tag_names,
			tokenize = 'porter unicode61'
		);

		CREATE TRIGGER IF NOT EXISTS saves_ai AFTER INSERT ON saves BEGIN
			INSERT INTO saves_fts(
				id, title, description, author, ocr_text, ai_caption,
				ai_summary, article_text, tag_names
			)
			VALUES (
				new.id, new.title, new.description, new.author, new.ocr_text, new.ai_caption,
				new.ai_summary, new.article_text,
				COALESCE(replace(replace(replace(new.tags, '[', ''), ']', ''), '"', ''), '')
			);
		END;

		CREATE TRIGGER IF NOT EXISTS saves_ad AFTER DELETE ON saves BEGIN
			DELETE FROM saves_fts WHERE id = old.id;
		END;

		CREATE TRIGGER IF NOT EXISTS saves_au AFTER UPDATE ON saves BEGIN
			DELETE FROM saves_fts WHERE id = old.id;
			INSERT INTO saves_fts(
				id, title, description, author, ocr_text, ai_caption,
				ai_summary, article_text, tag_names
			)
			VALUES (
				new.id, new.title, new.description, new.author, new.ocr_text, new.ai_caption,
				new.ai_summary, new.article_text,
				COALESCE(replace(replace(replace(new.tags, '[', ''), ']', ''), '"', ''), '')
			);
		END;
	`);

  try {
    ensureVecTable(sqlite);
  } catch (err) {
    log.warn("[pond db] vec0 setup failed", err);
  }
}

function ensureVecTable(sqlite: Database.Database): void {
  const dim = readEmbeddingDim(sqlite);
  const existing = sqlite
    .prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='saves_vec'`,
    )
    .get() as { name: string } | undefined;
  if (!existing) {
    sqlite.exec(
      `CREATE VIRTUAL TABLE saves_vec USING vec0(
        save_id TEXT PRIMARY KEY,
        embedding FLOAT[${dim}]
      )`,
    );
    return;
  }
  const storedDim = readMetaDim(sqlite);
  if (storedDim !== null && storedDim !== dim) {
    log.warn(
      `[pond db] embedding dim changed (${storedDim} -> ${dim}); recreating vec0`,
    );
    sqlite.exec(`DROP TABLE saves_vec`);
    sqlite.exec(
      `CREATE VIRTUAL TABLE saves_vec USING vec0(
        save_id TEXT PRIMARY KEY,
        embedding FLOAT[${dim}]
      )`,
    );
    sqlite
      .prepare(
        `UPDATE saves SET embedding_updated_at = NULL WHERE embedding_updated_at IS NOT NULL`,
      )
      .run();
  }
  writeMetaDim(sqlite, dim);
}

export async function recreateVecTable(): Promise<void> {
  const db = await getDb();
  const raw = db.$raw;
  const dim = readEmbeddingDim(raw);
  raw.exec(`DROP TABLE IF EXISTS saves_vec`);
  raw.exec(
    `CREATE VIRTUAL TABLE saves_vec USING vec0(
      save_id TEXT PRIMARY KEY,
      embedding FLOAT[${dim}]
    )`,
  );
  raw
    .prepare(
      `UPDATE saves SET embedding_updated_at = NULL WHERE embedding_updated_at IS NOT NULL`,
    )
    .run();
  writeMetaDim(raw, dim);
  log.info(`[pond db] recreated vec0 at dim=${dim}`);
}

function readMetaDim(sqlite: Database.Database): number | null {
  try {
    sqlite.exec(
      `CREATE TABLE IF NOT EXISTS pond_meta (key TEXT PRIMARY KEY, value TEXT)`,
    );
    const row = sqlite
      .prepare(`SELECT value FROM pond_meta WHERE key = 'vec_dim'`)
      .get() as { value: string } | undefined;
    if (!row) return null;
    const n = Number.parseInt(row.value, 10);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeMetaDim(sqlite: Database.Database, dim: number): void {
  try {
    sqlite
      .prepare(
        `INSERT INTO pond_meta(key, value) VALUES('vec_dim', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(String(dim));
  } catch {
    /* ignore */
  }
}

function readEmbeddingDim(sqlite: Database.Database): number {
  try {
    const row = sqlite
      .prepare(`SELECT ai_provider FROM settings WHERE id = 'singleton'`)
      .get() as { ai_provider: string | null } | undefined;
    if (!row?.ai_provider) return 768;
    const parsed = JSON.parse(row.ai_provider) as { embeddingDim?: number };
    if (typeof parsed.embeddingDim === "number" && parsed.embeddingDim > 0) {
      return parsed.embeddingDim;
    }
  } catch {
    /* fall through */
  }
  return 768;
}

async function ensureLibraryMetadata(): Promise<void> {
  const paths = resolvePaths();
  if (existsSync(paths.libraryMetadata)) return;
  const body = {
    id: cryptoRandomId(),
    name: DEFAULT_LIBRARY_NAME,
    createdAt: Date.now(),
    schemaVersion: LIBRARY_SCHEMA_VERSION,
    appVersion: process.env.npm_package_version ?? "0.1.0",
  };
  await writeFile(paths.libraryMetadata, JSON.stringify(body, null, 2));
  log.info("[pond] library metadata written", paths.libraryMetadata);
}

function cryptoRandomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

void join;

export { sql };
