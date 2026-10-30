import { LEGACY_IMPORT_PREFIXES } from "@pond/schema/import-origin";
import type Database from "better-sqlite3";
import { z } from "zod";

const CountRowSchema = z.object({ n: z.number() });
const ColumnRowSchema = z.object({ name: z.string() });

export function migrateGlobal(sqlite: Database.Database): void {
  sqlite.exec(`
				CREATE TABLE IF NOT EXISTS settings (
					id TEXT PRIMARY KEY DEFAULT 'singleton',
					video_download TEXT NOT NULL DEFAULT '{"autoDownload":false,"maxHeight":1080,"maxFileSizeMb":500}',
					image_download TEXT,
					prefs TEXT,
					library_root TEXT,
					onboarded INTEGER NOT NULL DEFAULT 0,
					updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
				);
			`);
}

export function migratePond(sqlite: Database.Database): void {
  sqlite.exec(`
				CREATE TABLE IF NOT EXISTS saves (
					id TEXT PRIMARY KEY,
					source TEXT NOT NULL,
					source_id TEXT NOT NULL,
					account_id TEXT,
					imported_from TEXT,
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
					list_kinds TEXT NOT NULL DEFAULT '[]',
					files TEXT NOT NULL DEFAULT '[]',
					cover_index INTEGER NOT NULL DEFAULT 0,
					width INTEGER,
					height INTEGER,
					file_size INTEGER,
					container TEXT,
					video_codec TEXT,
					audio_codec TEXT,
					bitrate INTEGER,
					color_space TEXT,
					camera_make TEXT,
					camera_model TEXT,
					lens_model TEXT,
					focal_length REAL,
					aperture REAL,
					exposure_time TEXT,
					iso INTEGER,
					taken_at INTEGER,
					metadata_version INTEGER,
					phash TEXT,
					blurhash TEXT,
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
					sensitive_score REAL,
					sensitive_model TEXT,
					auto_title_model TEXT,
					suggested_tags TEXT,
					suggested_tags_model TEXT,
					rating INTEGER,
					rotate INTEGER NOT NULL DEFAULT 0,
					flip_x INTEGER NOT NULL DEFAULT 0,
					flip_y INTEGER NOT NULL DEFAULT 0,
					crop TEXT,
					dominant_colors TEXT NOT NULL DEFAULT '[]',
					primary_color TEXT,
					font_activated INTEGER NOT NULL DEFAULT 0,
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
				CREATE INDEX IF NOT EXISTS saves_source_idx ON saves(source);
				CREATE INDEX IF NOT EXISTS saves_size_idx ON saves(file_size);
				CREATE INDEX IF NOT EXISTS saves_dims_idx ON saves(width, height);
				CREATE INDEX IF NOT EXISTS saves_deleted_idx ON saves(deleted_at);
				CREATE INDEX IF NOT EXISTS saves_status_idx ON saves(status);

				CREATE TABLE IF NOT EXISTS queue_generations (
					id TEXT PRIMARY KEY,
					kind TEXT NOT NULL,
					status TEXT NOT NULL DEFAULT 'active',
					source TEXT,
					scope TEXT,
					cancellation_fence INTEGER NOT NULL DEFAULT 0,
					created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
					updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
					completed_at INTEGER
				);
				CREATE INDEX IF NOT EXISTS queue_generations_status_created_idx
					ON queue_generations(status, created_at);
				CREATE INDEX IF NOT EXISTS queue_generations_source_status_idx
					ON queue_generations(source, status);

				CREATE TABLE IF NOT EXISTS source_gates (
					source TEXT PRIMARY KEY,
					state TEXT NOT NULL DEFAULT 'closed',
					reason TEXT,
					retry_at INTEGER,
					probe_lease_token TEXT,
					probe_lease_expires_at INTEGER,
					failure_count INTEGER NOT NULL DEFAULT 0,
					failure_window_started_at INTEGER,
					version INTEGER NOT NULL DEFAULT 0,
					updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
				);

				CREATE TABLE IF NOT EXISTS source_request_ledger (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					source TEXT NOT NULL,
					requested_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
					permits INTEGER NOT NULL DEFAULT 1,
					task_id TEXT,
					generation_id TEXT REFERENCES queue_generations(id) ON DELETE SET NULL
				);
				CREATE INDEX IF NOT EXISTS source_request_ledger_source_requested_idx
					ON source_request_ledger(source, requested_at);
				CREATE INDEX IF NOT EXISTS source_request_ledger_generation_idx
					ON source_request_ledger(generation_id);

				CREATE TABLE IF NOT EXISTS queue_metadata (
					key TEXT PRIMARY KEY,
					value TEXT NOT NULL,
					updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
				);

				CREATE TABLE IF NOT EXISTS tasks (
					id TEXT PRIMARY KEY,
					save_id TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
					source TEXT NOT NULL,
					op TEXT NOT NULL,
					status TEXT NOT NULL DEFAULT 'pending',
					attempts INTEGER NOT NULL DEFAULT 0,
					max_attempts INTEGER NOT NULL DEFAULT 5,
					generation_id TEXT REFERENCES queue_generations(id) ON DELETE SET NULL,
					cancellation_fence INTEGER NOT NULL DEFAULT 0,
					deferred_reason TEXT,
					lease_owner TEXT,
					lease_token TEXT,
					lease_expires_at INTEGER,
					heartbeat_at INTEGER,
					started_at INTEGER,
					failed_at INTEGER,
					completed_at INTEGER,
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

				CREATE TABLE IF NOT EXISTS folders (
					id TEXT PRIMARY KEY,
					parent_id TEXT,
					name TEXT NOT NULL,
					color TEXT,
					sort_order INTEGER NOT NULL DEFAULT 0,
					created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
				);
				CREATE INDEX IF NOT EXISTS folders_parent_idx ON folders(parent_id, sort_order);

				CREATE TABLE IF NOT EXISTS folder_metadata (
					folder_id TEXT PRIMARY KEY REFERENCES folders(id) ON DELETE CASCADE,
					description TEXT,
					external_link TEXT
				);

				CREATE TABLE IF NOT EXISTS save_folders (
					save_id TEXT NOT NULL REFERENCES saves(id) ON DELETE CASCADE,
					folder_id TEXT NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
					PRIMARY KEY (save_id, folder_id)
				);
				CREATE INDEX IF NOT EXISTS save_folders_save_idx ON save_folders(save_id);
				CREATE INDEX IF NOT EXISTS save_folders_folder_idx ON save_folders(folder_id);

				CREATE TABLE IF NOT EXISTS agent_chats (
					id TEXT PRIMARY KEY,
					title TEXT,
					canonical_transcript TEXT,
					created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
					updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
				);

				CREATE TABLE IF NOT EXISTS agent_messages (
					id TEXT PRIMARY KEY,
					chat_id TEXT NOT NULL REFERENCES agent_chats(id) ON DELETE CASCADE,
					role TEXT NOT NULL,
					content TEXT NOT NULL,
					metadata TEXT,
					created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
				);
				CREATE INDEX IF NOT EXISTS agent_messages_chat_idx ON agent_messages(chat_id, created_at);

				CREATE TABLE IF NOT EXISTS agent_chat_fish (
					chat_id TEXT PRIMARY KEY REFERENCES agent_chats(id) ON DELETE CASCADE,
					fish_id TEXT NOT NULL
				);
				CREATE INDEX IF NOT EXISTS agent_chat_fish_fish_idx ON agent_chat_fish(fish_id);

				CREATE TABLE IF NOT EXISTS saved_views (
					id TEXT PRIMARY KEY,
					name TEXT NOT NULL,
					kind TEXT NOT NULL DEFAULT 'saved_view',
					parent_id TEXT,
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

  sqlite.exec(`
				CREATE INDEX IF NOT EXISTS tasks_source_op_idx
					ON tasks(source, op, status, next_run_at);
				CREATE INDEX IF NOT EXISTS tasks_generation_idx
					ON tasks(generation_id, status);
				CREATE INDEX IF NOT EXISTS tasks_lease_recovery_idx
					ON tasks(status, lease_expires_at);
				CREATE INDEX IF NOT EXISTS tasks_claim_idx
					ON tasks(source, op, next_run_at, created_at)
					WHERE status IN ('pending', 'deferred');
				CREATE INDEX IF NOT EXISTS tasks_running_lease_idx
					ON tasks(lease_expires_at)
					WHERE status = 'running';
				CREATE INDEX IF NOT EXISTS saves_account_idx ON saves(account_id);
				CREATE INDEX IF NOT EXISTS saves_has_embedding_idx
					ON saves(id) WHERE embedding IS NOT NULL;
				CREATE INDEX IF NOT EXISTS saves_has_clip_embedding_idx
					ON saves(id) WHERE clip_embedding IS NOT NULL;
			`);

  ensureImportedFrom(sqlite);
  ensureSavesFts(sqlite);
}

/** `CREATE TABLE IF NOT EXISTS` leaves existing indexes without the column, so add it and fill it from legacy source id prefixes. */
function ensureImportedFrom(sqlite: Database.Database): void {
  const columns = sqlite
    .prepare("PRAGMA table_info(saves)")
    .all()
    .map((row) => ColumnRowSchema.parse(row).name);
  if (columns.includes("imported_from")) return;
  sqlite.transaction(() => {
    sqlite.exec("ALTER TABLE saves ADD COLUMN imported_from TEXT");
    const backfill = sqlite.prepare(`
			UPDATE saves SET imported_from = ?
			WHERE source = 'local'
				AND imported_from IS NULL
				AND substr(source_id, 1, length(?)) = ?
		`);
    for (const [prefix, origin] of LEGACY_IMPORT_PREFIXES)
      backfill.run(origin, prefix, prefix);
  })();
}

function ensureSavesFts(sqlite: Database.Database): void {
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

  const count = CountRowSchema.parse(
    sqlite.prepare("SELECT COUNT(*) AS n FROM saves_fts").get(),
  );
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
