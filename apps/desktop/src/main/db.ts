import { existsSync } from "node:fs";
import * as schema from "@pond/schema/db";
import * as eventsSchema from "@pond/schema/events";
import Database from "better-sqlite3";
import {
  type BetterSQLite3Database,
  drizzle,
} from "drizzle-orm/better-sqlite3";
import log from "electron-log/main.js";
import { readOrCreatePondId } from "./lib/pond-identity";
import { backfillRawSlim } from "./lib/raw-slim";
import { resolvePaths } from "./paths";

const combinedSchema = { ...schema, ...eventsSchema };

export type Db = BetterSQLite3Database<typeof combinedSchema> & {
  $raw: Database.Database;
};

/** The pond index is per-pond and swaps on a library switch; the global DB is shared. */
let cachedPond: Db | null = null;
let cachedGlobal: Db | null = null;

function openSqlite(file: string): Database.Database {
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("synchronous = NORMAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("temp_store = MEMORY");
  /** 256 MiB. */
  sqlite.pragma("mmap_size = 268435456");
  /** Wait rather than throw SQLITE_BUSY when a write races a WAL checkpoint or a concurrent connection. */
  sqlite.pragma("busy_timeout = 5000");
  /** ~64 MiB page cache (negative = KiB); keeps hot pages resident during bulk inserts and FTS rebuilds. */
  sqlite.pragma("cache_size = -65536");
  /** Checkpoint less eagerly than the 1000-page default so a burst of batched writes isn't interrupted mid-transaction. */
  sqlite.pragma("wal_autocheckpoint = 2000");
  return sqlite;
}

function wrap(sqlite: Database.Database): Db {
  const drizzled = drizzle(sqlite, { schema: combinedSchema });
  return Object.assign(drizzled, { $raw: sqlite }) as Db;
}

/** App-global state in one file; readable at boot before any pond is resolved. */
export async function getGlobalDb(): Promise<Db> {
  if (cachedGlobal) return cachedGlobal;
  const paths = resolvePaths();
  log.info("[pond db] opening global", paths.globalDb);
  const sqlite = openSqlite(paths.globalDb);
  migrateGlobal(sqlite);
  cachedGlobal = wrap(sqlite);
  return cachedGlobal;
}

/** Active pond's index cache; closeDb() drops it on a switch. */
export async function getDb(): Promise<Db> {
  if (cachedPond) return cachedPond;

  const paths = resolvePaths();
  log.info("[pond db] opening pond index", paths.indexDb);

  const sqlite = openSqlite(paths.indexDb);
  migratePond(sqlite);
  backfillRawSlim(sqlite);
  cachedPond = wrap(sqlite);

  ensureLibraryMetadata();

  try {
    const { runLibraryScopeMigration } = await import(
      "./core/library-scope-migration"
    );
    await runLibraryScopeMigration();
  } catch (err) {
    log.warn("[pond db] library scope migration failed", err);
  }

  return cachedPond;
}

/** Drops the pond handle so the next getDb() reopens; pair with invalidatePaths(). */
export function closeDb(): void {
  if (!cachedPond) return;
  try {
    cachedPond.$raw.close();
  } catch (err) {
    log.warn("[pond db] close failed", err);
  }
  cachedPond = null;
}

function migrateGlobal(sqlite: Database.Database): void {
  sqlite.exec(`
				CREATE TABLE IF NOT EXISTS settings (
					id TEXT PRIMARY KEY DEFAULT 'singleton',
					video_download TEXT NOT NULL DEFAULT '{"enabled":true,"maxHeight":1080,"maxFileSizeMb":500}',
					image_download TEXT,
					prefs TEXT,
					library_root TEXT,
					onboarded INTEGER NOT NULL DEFAULT 0,
					updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
				);
			`);
}

function migratePond(sqlite: Database.Database): void {
  sqlite.exec(`
				CREATE TABLE IF NOT EXISTS saves (
					id TEXT PRIMARY KEY,
					source TEXT NOT NULL,
					source_id TEXT NOT NULL,
					account_id TEXT,
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
					raw_slim TEXT,
					tags TEXT NOT NULL DEFAULT '[]',
					files TEXT NOT NULL DEFAULT '[]',
					cover_index INTEGER NOT NULL DEFAULT 0,
					width INTEGER,
					height INTEGER,
					file_size INTEGER,
					phash TEXT,
					embedding TEXT,
					embedding_model TEXT,
					caption TEXT,
					caption_model TEXT,
					ocr_text TEXT,
					ocr_model TEXT,
					transcript TEXT,
					transcript_model TEXT,
					clip_embedding TEXT,
					clip_model TEXT,
					aesthetic TEXT,
					aesthetic_model TEXT,
					auto_title_model TEXT,
					suggested_tags TEXT,
					suggested_tags_model TEXT,
					video_notes TEXT NOT NULL DEFAULT '[]',
					dominant_colors TEXT NOT NULL DEFAULT '[]',
					status TEXT NOT NULL DEFAULT 'ingesting',
					ingest_started_at INTEGER,
					ingest_completed_at INTEGER,
					deleted_at INTEGER,
					saved_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
					created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
					UNIQUE(source, source_id)
				);

				CREATE INDEX IF NOT EXISTS saves_saved_at_id_idx
					ON saves(saved_at DESC, id DESC);
				DROP INDEX IF EXISTS saves_saved_at_idx;
				CREATE INDEX IF NOT EXISTS saves_source_idx ON saves(source);
				CREATE INDEX IF NOT EXISTS saves_size_idx ON saves(file_size);
				CREATE INDEX IF NOT EXISTS saves_dims_idx ON saves(width, height);
				CREATE INDEX IF NOT EXISTS saves_deleted_idx ON saves(deleted_at);
				CREATE INDEX IF NOT EXISTS saves_status_idx ON saves(status);

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
					description TEXT,
					starred INTEGER NOT NULL DEFAULT 0,
					archived INTEGER NOT NULL DEFAULT 0,
					last_used_at INTEGER,
					usage_count INTEGER NOT NULL DEFAULT 0,
					created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
				);
				-- Case-insensitive name lookups (rename/merge collision checks).
				CREATE INDEX IF NOT EXISTS tags_name_lower_idx ON tags(lower(name));

				CREATE TABLE IF NOT EXISTS tag_groups (
					id TEXT PRIMARY KEY,
					name TEXT NOT NULL UNIQUE,
					description TEXT,
					color TEXT,
					sort_order INTEGER NOT NULL DEFAULT 0,
					collapsed INTEGER NOT NULL DEFAULT 0,
					created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
				);

				CREATE TABLE IF NOT EXISTS tag_group_members (
					tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
					group_id TEXT NOT NULL REFERENCES tag_groups(id) ON DELETE CASCADE,
					sort_order INTEGER NOT NULL DEFAULT 0,
					PRIMARY KEY (tag_id, group_id)
				);
				CREATE INDEX IF NOT EXISTS tag_group_members_tag_idx ON tag_group_members(tag_id);
				CREATE INDEX IF NOT EXISTS tag_group_members_group_idx ON tag_group_members(group_id);

				CREATE TABLE IF NOT EXISTS saved_views (
					id TEXT PRIMARY KEY,
					name TEXT NOT NULL,
					question TEXT,
					query TEXT NOT NULL DEFAULT '{"kind":"and","clauses":[]}',
					sort_key TEXT NOT NULL DEFAULT 'savedAt',
					sort_dir TEXT NOT NULL DEFAULT 'desc',
					layout TEXT,
					sort_order INTEGER NOT NULL DEFAULT 0,
					created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
				);

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
					account_id TEXT,
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
				CREATE INDEX IF NOT EXISTS pipeline_events_kind_ts_idx ON pipeline_events(kind, ts);
				CREATE INDEX IF NOT EXISTS pipeline_events_source_op_idx ON pipeline_events(source, op);
			`);

  addColumnIfMissing(sqlite, "saved_views", "question", "TEXT");
  addColumnIfMissing(sqlite, "tags", "archived", "INTEGER NOT NULL DEFAULT 0");
  addColumnIfMissing(sqlite, "tags", "description", "TEXT");
  addColumnIfMissing(sqlite, "tag_groups", "description", "TEXT");
  addColumnIfMissing(sqlite, "tags", "color", "TEXT");
  addColumnIfMissing(sqlite, "saves", "raw_slim", "TEXT");
  addColumnIfMissing(sqlite, "saves", "embedding", "TEXT");
  addColumnIfMissing(sqlite, "saves", "embedding_model", "TEXT");
  addColumnIfMissing(sqlite, "saves", "caption", "TEXT");
  addColumnIfMissing(sqlite, "saves", "caption_model", "TEXT");
  addColumnIfMissing(sqlite, "saves", "ocr_text", "TEXT");
  addColumnIfMissing(sqlite, "saves", "ocr_model", "TEXT");
  addColumnIfMissing(sqlite, "saves", "transcript", "TEXT");
  addColumnIfMissing(sqlite, "saves", "transcript_model", "TEXT");
  addColumnIfMissing(sqlite, "saves", "clip_embedding", "TEXT");
  addColumnIfMissing(sqlite, "saves", "clip_model", "TEXT");
  addColumnIfMissing(sqlite, "saves", "aesthetic", "TEXT");
  addColumnIfMissing(sqlite, "saves", "aesthetic_model", "TEXT");
  addColumnIfMissing(sqlite, "saves", "auto_title_model", "TEXT");
  addColumnIfMissing(sqlite, "saves", "suggested_tags", "TEXT");
  addColumnIfMissing(sqlite, "saves", "suggested_tags_model", "TEXT");
  addColumnIfMissing(sqlite, "saves", "account_id", "TEXT");
  addColumnIfMissing(sqlite, "pipeline_events", "account_id", "TEXT");
  sqlite.exec(
    "CREATE INDEX IF NOT EXISTS saves_account_idx ON saves(account_id);",
  );

  /** Partial indexes: most rows have no vector, so these stay tiny and keep "has/needs an embedding" scans cheap. */
  sqlite.exec(`
				CREATE INDEX IF NOT EXISTS saves_has_embedding_idx
					ON saves(id) WHERE embedding IS NOT NULL;
				CREATE INDEX IF NOT EXISTS saves_has_clip_embedding_idx
					ON saves(id) WHERE clip_embedding IS NOT NULL;
			`);

  /** FTS5 over save text; the virtual table can't be ALTERed, so on upgrade it and the triggers are rebuilt when columns drift. */
  ensureSavesFts(sqlite);
}

/** Columns the FTS index must carry; bump this list to force a rebuild on upgrade. */
const SAVES_FTS_COLUMNS = [
  "id",
  "title",
  "description",
  "author",
  "tag_names",
  "caption",
  "ocr_text",
  "transcript",
  "notes",
  "url",
] as const;

function ensureSavesFts(sqlite: Database.Database): void {
  const existing = (
    sqlite.prepare("PRAGMA table_info(saves_fts)").all() as Array<{
      name: string;
    }>
  ).map((c) => c.name);
  const hasAll = SAVES_FTS_COLUMNS.every((c) => existing.includes(c));
  if (existing.length > 0 && !hasAll) {
    sqlite.exec(`
				DROP TRIGGER IF EXISTS saves_ai;
				DROP TRIGGER IF EXISTS saves_ad;
				DROP TRIGGER IF EXISTS saves_au;
				DROP TABLE IF EXISTS saves_fts;
			`);
  }

  /** The UPDATE trigger is scoped to FTS-indexed columns to avoid write amplification from high-churn ingest columns; drop any unscoped trigger first because CREATE IF NOT EXISTS won't replace it. */
  sqlite.exec("DROP TRIGGER IF EXISTS saves_au;");

  sqlite.exec(`
				CREATE VIRTUAL TABLE IF NOT EXISTS saves_fts USING fts5(
					id UNINDEXED,
					title,
					description,
					author,
					tag_names,
					caption,
					ocr_text,
					transcript,
					notes,
					url,
					tokenize = 'porter unicode61'
				);

				CREATE TRIGGER IF NOT EXISTS saves_ai AFTER INSERT ON saves BEGIN
					INSERT INTO saves_fts(id, title, description, author, tag_names, caption, ocr_text, transcript, notes, url)
					VALUES (
						new.id, new.title, new.description, new.author,
						COALESCE(replace(replace(replace(new.tags, '[', ''), ']', ''), '"', ''), ''),
						new.caption, new.ocr_text, new.transcript, new.notes, new.url
					);
				END;

				CREATE TRIGGER IF NOT EXISTS saves_ad AFTER DELETE ON saves BEGIN
					DELETE FROM saves_fts WHERE id = old.id;
				END;

				CREATE TRIGGER IF NOT EXISTS saves_au
				AFTER UPDATE OF title, description, author, tags, caption, ocr_text, transcript, notes, url
				ON saves BEGIN
					DELETE FROM saves_fts WHERE id = old.id;
					INSERT INTO saves_fts(id, title, description, author, tag_names, caption, ocr_text, transcript, notes, url)
					VALUES (
						new.id, new.title, new.description, new.author,
						COALESCE(replace(replace(replace(new.tags, '[', ''), ']', ''), '"', ''), ''),
						new.caption, new.ocr_text, new.transcript, new.notes, new.url
					);
				END;
			`);

  /** Repopulate after a rebuild so existing rows are searchable. */
  const count = sqlite.prepare("SELECT COUNT(*) AS n FROM saves_fts").get() as {
    n: number;
  };
  if (count.n === 0) {
    sqlite.exec(`
					INSERT INTO saves_fts(id, title, description, author, tag_names, caption, ocr_text, transcript, notes, url)
					SELECT
						id, title, description, author,
						COALESCE(replace(replace(replace(tags, '[', ''), ']', ''), '"', ''), ''),
						caption, ocr_text, transcript, notes, url
					FROM saves;
				`);
  }
}

/** SQLite has no `ADD COLUMN IF NOT EXISTS`; guard against re-adding on upgrade. */
function addColumnIfMissing(
  sqlite: Database.Database,
  table: string,
  column: string,
  type: string,
): void {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{
    name: string;
  }>;
  if (cols.some((c) => c.name === column)) return;
  sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

function ensureLibraryMetadata(): void {
  const paths = resolvePaths();
  /** No bundle yet: the first write materializes it and writes metadata via one writer. */
  if (!existsSync(paths.libraryRoot)) return;
  if (existsSync(paths.libraryMetadata)) return;
  readOrCreatePondId(paths.libraryRoot);
}
