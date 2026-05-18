import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import * as schema from "@pond/schema/db";
import * as eventsSchema from "@pond/schema/events";
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

const combinedSchema = { ...schema, ...eventsSchema };

export type Db = BetterSQLite3Database<typeof combinedSchema> & {
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

  migrate(sqlite);

  const drizzled = drizzle(sqlite, { schema: combinedSchema });
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
					files TEXT NOT NULL DEFAULT '[]',
					cover_index INTEGER NOT NULL DEFAULT 0,
					width INTEGER,
					height INTEGER,
					file_size INTEGER,
					deleted_at INTEGER,
					saved_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
					created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
					UNIQUE(source, source_id)
				);

				CREATE INDEX IF NOT EXISTS saves_saved_at_idx ON saves(saved_at);
				CREATE INDEX IF NOT EXISTS saves_source_idx ON saves(source);
				CREATE INDEX IF NOT EXISTS saves_size_idx ON saves(file_size);
				CREATE INDEX IF NOT EXISTS saves_dims_idx ON saves(width, height);
				CREATE INDEX IF NOT EXISTS saves_deleted_idx ON saves(deleted_at);

				CREATE TABLE IF NOT EXISTS tasks (
					id TEXT PRIMARY KEY,
					save_id TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
					op TEXT NOT NULL,
					status TEXT NOT NULL DEFAULT 'pending',
					attempts INTEGER NOT NULL DEFAULT 0,
					max_attempts INTEGER NOT NULL DEFAULT 5,
					next_run_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
					last_error TEXT,
					payload TEXT,
					created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
					updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
					UNIQUE(save_id, op)
				);
				CREATE INDEX IF NOT EXISTS tasks_next_run_idx ON tasks(status, next_run_at);
				CREATE INDEX IF NOT EXISTS tasks_save_idx ON tasks(save_id);

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

				CREATE TABLE IF NOT EXISTS pipeline_events (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
					kind TEXT NOT NULL,
					save_id TEXT,
					source TEXT,
					op TEXT,
					outcome TEXT NOT NULL,
					duration_ms INTEGER,
					attempts INTEGER,
					error_name TEXT,
					error_message TEXT,
					trigger TEXT,
					payload TEXT NOT NULL
				);
				CREATE INDEX IF NOT EXISTS pipeline_events_ts_idx ON pipeline_events(ts);
				CREATE INDEX IF NOT EXISTS pipeline_events_save_idx ON pipeline_events(save_id, ts);
				CREATE INDEX IF NOT EXISTS pipeline_events_kind_outcome_idx ON pipeline_events(kind, outcome, ts);
				CREATE INDEX IF NOT EXISTS pipeline_events_source_op_idx ON pipeline_events(source, op);

				CREATE TABLE IF NOT EXISTS settings (
					id TEXT PRIMARY KEY DEFAULT 'singleton',
					video_download TEXT NOT NULL DEFAULT '{"enabled":true,"maxHeight":1080,"maxFileSizeMb":500}',
					prefs TEXT,
					library_root TEXT,
					onboarded INTEGER NOT NULL DEFAULT 0,
					updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
				);
			`);

  dropLegacyArtifacts(sqlite);
  ensureSavesPipelineColumns(sqlite);
  ensureTagsLabelColumns(sqlite);
  dropArchivedAtColumn(sqlite);
  hardDeleteArticleSaves(sqlite);
  backfillCompleteStatusForExistingSaves(sqlite);

  sqlite.exec(`
				CREATE VIRTUAL TABLE IF NOT EXISTS saves_fts USING fts5(
					id UNINDEXED,
					title,
					description,
					author,
					tag_names,
					tokenize = 'porter unicode61'
				);

				CREATE TRIGGER IF NOT EXISTS saves_ai AFTER INSERT ON saves BEGIN
					INSERT INTO saves_fts(id, title, description, author, tag_names)
					VALUES (
						new.id, new.title, new.description, new.author,
						COALESCE(replace(replace(replace(new.tags, '[', ''), ']', ''), '"', ''), '')
					);
				END;

				CREATE TRIGGER IF NOT EXISTS saves_ad AFTER DELETE ON saves BEGIN
					DELETE FROM saves_fts WHERE id = old.id;
				END;

				CREATE TRIGGER IF NOT EXISTS saves_au AFTER UPDATE ON saves BEGIN
					DELETE FROM saves_fts WHERE id = old.id;
					INSERT INTO saves_fts(id, title, description, author, tag_names)
					VALUES (
						new.id, new.title, new.description, new.author,
						COALESCE(replace(replace(replace(new.tags, '[', ''), ']', ''), '"', ''), '')
					);
				END;
			`);
}

// One-time forward-only cleanup. Drops AI-only tables from earlier
// builds, plus the old FTS table + triggers so the CREATE IF NOT
// EXISTS above rebuilds them with the current column set (the legacy
// schema referenced ai_caption / ai_summary / ocr_text).
function ensureSavesPipelineColumns(sqlite: Database.Database): void {
  const cols = sqlite
    .prepare<unknown[], { name: string }>("PRAGMA table_info(saves)")
    .all() as { name: string }[];
  const have = new Set(cols.map((c) => c.name));
  if (!have.has("status")) {
    sqlite.exec(
      "ALTER TABLE saves ADD COLUMN status TEXT NOT NULL DEFAULT 'ingesting'",
    );
  }
  if (!have.has("ingest_started_at")) {
    sqlite.exec("ALTER TABLE saves ADD COLUMN ingest_started_at INTEGER");
  }
  if (!have.has("ingest_completed_at")) {
    sqlite.exec("ALTER TABLE saves ADD COLUMN ingest_completed_at INTEGER");
  }
  sqlite.exec("CREATE INDEX IF NOT EXISTS saves_status_idx ON saves(status)");
}

function ensureTagsLabelColumns(sqlite: Database.Database): void {
  const cols = sqlite
    .prepare<unknown[], { name: string }>("PRAGMA table_info(tags)")
    .all() as { name: string }[];
  const have = new Set(cols.map((c) => c.name));
  if (!have.has("description")) {
    sqlite.exec("ALTER TABLE tags ADD COLUMN description TEXT");
  }
}

// hardDeleteArticleSaves — the article source has been removed from the
// URL-first pipeline. Any legacy rows tagged `article` are unreachable
// from the new code path; drop them so the renderer never has to render
// an unknown source.
function hardDeleteArticleSaves(sqlite: Database.Database): void {
  try {
    const info = sqlite
      .prepare("DELETE FROM saves WHERE source = 'article'")
      .run();
    if (info.changes > 0) {
      log.info(
        `[pond db] migration: hard-deleted ${info.changes} article saves`,
      );
    }
  } catch (err) {
    log.warn("[pond db] article cleanup failed", err);
  }
}

// backfillCompleteStatusForExistingSaves — saves created before the
// status column existed default to `ingesting`. If they already have at
// least one file on disk we know ingest finished long ago, so mark them
// `complete` and stamp ingestCompletedAt to silence the in-progress UI.
function backfillCompleteStatusForExistingSaves(
  sqlite: Database.Database,
): void {
  try {
    const info = sqlite
      .prepare(
        `UPDATE saves
         SET status = 'complete',
             ingest_completed_at = COALESCE(ingest_completed_at, saved_at)
         WHERE status = 'ingesting'
           AND files IS NOT NULL
           AND files != '[]'
           AND id NOT IN (SELECT save_id FROM tasks)`,
      )
      .run();
    if (info.changes > 0) {
      log.info(
        `[pond db] migration: marked ${info.changes} legacy saves as complete`,
      );
    }
  } catch (err) {
    log.warn("[pond db] complete-status backfill failed", err);
  }
}

function dropLegacyArtifacts(sqlite: Database.Database): void {
  try {
    sqlite.exec(`
			DROP TABLE IF EXISTS enrich_jobs;
			DROP TABLE IF EXISTS saves_vec;
			DROP TABLE IF EXISTS pond_meta;
			DROP TRIGGER IF EXISTS saves_ai;
			DROP TRIGGER IF EXISTS saves_ad;
			DROP TRIGGER IF EXISTS saves_au;
			DROP TABLE IF EXISTS saves_fts;
			`);
  } catch (err) {
    log.warn("[pond db] legacy artifact drop failed", err);
  }
}

// The archive concept is gone — trash is the only soft-delete state.
// Drop the column from existing databases. SQLite 3.35+ supports
// `ALTER TABLE … DROP COLUMN`, which is what better-sqlite3 ships with.
function dropArchivedAtColumn(sqlite: Database.Database): void {
  try {
    const cols = sqlite
      .prepare<unknown[], { name: string }>("PRAGMA table_info(saves)")
      .all() as { name: string }[];
    const have = new Set(cols.map((c) => c.name));
    if (!have.has("archived_at")) return;
    sqlite.exec(`
			DROP INDEX IF EXISTS saves_archived_idx;
			ALTER TABLE saves DROP COLUMN archived_at;
		`);
    log.info("[pond db] migration: dropped archived_at column");
  } catch (err) {
    log.warn("[pond db] archived_at drop failed", err);
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
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export { sql };
