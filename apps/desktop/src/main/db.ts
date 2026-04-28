import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as schema from "@pond/schema/db";
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

/**
 * Open-or-create the SQLite index at `~/Library/Application Support/pond/
 * index.db`. Runs:
 *
 *   1. PRAGMA journal_mode=WAL for concurrent reads during writes
 *   2. Loads sqlite-vec so vec0 virtual tables are usable
 *   3. Creates tables if missing (inline CREATE TABLE IF NOT EXISTS — we
 *      don't ship drizzle-kit migrations in the packaged app, we own the
 *      schema at runtime because the DB is a rebuildable cache, not a
 *      source of truth)
 *   4. Creates the FTS5 table + triggers
 *   5. Writes the library `metadata.json` if absent
 */
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

  migrate(sqlite);

  const drizzled = drizzle(sqlite, { schema });
  const db = Object.assign(drizzled, { $raw: sqlite }) as Db;
  cached = db;

  await ensureLibraryMetadata();

  return db;
}

/**
 * Schema install. We keep everything in one place so `index.db` can be
 * deleted and regenerated from the library without user intervention.
 */
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
			notes TEXT,
			media_url TEXT,
			blob_url TEXT,
			media_type TEXT,
			raw_json TEXT,
			tags TEXT NOT NULL DEFAULT '[]',
			ai_tags TEXT NOT NULL DEFAULT '[]',
			ai_caption TEXT,
			ai_suggestions TEXT,
			ocr_text TEXT,
			dominant_colors TEXT,
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

		CREATE TABLE IF NOT EXISTS __transactions (
			id TEXT PRIMARY KEY,
			batch_id TEXT,
			tx TEXT NOT NULL,
			created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
			committed_at INTEGER
		);
		CREATE INDEX IF NOT EXISTS transactions_batch_idx ON __transactions(batch_id);

		CREATE TABLE IF NOT EXISTS library_scan (
			item_id TEXT PRIMARY KEY,
			mtime_ms INTEGER NOT NULL,
			scanned_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
		);

		CREATE TABLE IF NOT EXISTS settings (
			id TEXT PRIMARY KEY DEFAULT 'singleton',
			ai_autonomy TEXT NOT NULL,
			video_download TEXT NOT NULL DEFAULT '{"enabled":true,"maxHeight":1080,"maxFileSizeMb":500}',
			library_root TEXT,
			onboarded INTEGER NOT NULL DEFAULT 0,
			updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
		);
	`);

  // Back-fill for databases created before we added new columns. We could
  // switch to `PRAGMA user_version` once we have enough of these to warrant
  // a versioned migration table.
  try {
    const settingsCols = sqlite
      .prepare(`PRAGMA table_info(settings)`)
      .all() as Array<{ name: string }>;
    if (!settingsCols.some((c) => c.name === "onboarded")) {
      sqlite.exec(
        `ALTER TABLE settings ADD COLUMN onboarded INTEGER NOT NULL DEFAULT 0`,
      );
    }
    if (!settingsCols.some((c) => c.name === "video_download")) {
      sqlite.exec(
        `ALTER TABLE settings ADD COLUMN video_download TEXT NOT NULL DEFAULT '{"enabled":true,"maxHeight":1080,"maxFileSizeMb":500}'`,
      );
    }

    const savesCols = sqlite
      .prepare(`PRAGMA table_info(saves)`)
      .all() as Array<{
      name: string;
    }>;
    if (!savesCols.some((c) => c.name === "files")) {
      sqlite.exec(
        `ALTER TABLE saves ADD COLUMN files TEXT NOT NULL DEFAULT '[]'`,
      );
    }
  } catch (err) {
    log.warn("[pond db] column back-fill failed", err);
  }

  // FTS5 virtual table mirrors searchable fields. Populated via triggers so
  // the index stays in sync with `saves` without executor-level plumbing.
  sqlite.exec(`
		CREATE VIRTUAL TABLE IF NOT EXISTS saves_fts USING fts5(
			id UNINDEXED,
			title,
			description,
			author,
			ocr_text,
			ai_caption,
			tag_names,
			tokenize = 'porter unicode61'
		);

		CREATE TRIGGER IF NOT EXISTS saves_ai AFTER INSERT ON saves BEGIN
			INSERT INTO saves_fts(id, title, description, author, ocr_text, ai_caption, tag_names)
			VALUES (new.id, new.title, new.description, new.author, new.ocr_text, new.ai_caption,
				COALESCE(replace(replace(replace(new.tags, '[', ''), ']', ''), '"', ''), ''));
		END;

		CREATE TRIGGER IF NOT EXISTS saves_ad AFTER DELETE ON saves BEGIN
			DELETE FROM saves_fts WHERE id = old.id;
		END;

		CREATE TRIGGER IF NOT EXISTS saves_au AFTER UPDATE ON saves BEGIN
			DELETE FROM saves_fts WHERE id = old.id;
			INSERT INTO saves_fts(id, title, description, author, ocr_text, ai_caption, tag_names)
			VALUES (new.id, new.title, new.description, new.author, new.ocr_text, new.ai_caption,
				COALESCE(replace(replace(replace(new.tags, '[', ''), ']', ''), '"', ''), ''));
		END;
	`);

  // Vector index. 1536-dim matches OpenAI text-embedding-3-small. If
  // sqlite-vec didn't load, this will fail silently — `vec0` is only
  // available when the extension is loaded.
  try {
    sqlite.exec(`
			CREATE VIRTUAL TABLE IF NOT EXISTS saves_vec USING vec0(
				save_id TEXT PRIMARY KEY,
				embedding FLOAT[1536]
			);
		`);
  } catch (err) {
    log.warn("[pond db] vec0 not created", err);
  }
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
  // Only used once for the library identifier. Keep the dependency surface
  // tiny by avoiding `ulid` here (main hasn't imported it yet at boot).
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Keep `join` referenced so tsc doesn't trim the import when the module is
// bundled via externalizeDepsPlugin.
void join;

export { sql };
