import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

/**
 * Pond uses SQLite as a **rebuildable index** over a filesystem-backed
 * library (see plan § "Where stuff is saved on disk"). The per-item
 * `metadata.json` on disk is the source of truth; rows in `saves` can be
 * rebuilt by walking the `items/` tree. Nothing in this file is
 * authoritative on its own.
 *
 * Pond is a single-user local app — no workspace/user scoping here, ever.
 */

export const SOURCES = [
  "twitter",
  "instagram",
  "pinterest",
  "arena",
  "cosmos",
  "tiktok",
  "youtube",
  "article",
] as const;
export type Source = (typeof SOURCES)[number];

export const MEDIA_TYPES = ["image", "video", "link", "article"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

/** AI-extracted dominant colour from the cover image. */
export interface DominantColor {
  hex: string;
  weight: number;
}

/**
 * One media file associated with a save. The first entry (index 0) is the
 * visible cover; subsequent entries are carousel/video-track siblings.
 * Mirrors the on-disk `metadata.json files[]` array 1:1.
 */
export interface SaveFile {
  /** `cover` | `media` | `video` | `other` */
  kind: string;
  /** Filename inside `items/<id>.info/` (e.g. `cover.jpg`, `media-1.jpg`). */
  path: string;
  sha256: string;
  size: number;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
}

/**
 * Per-field AI provenance, separate from the user-applied real columns.
 * See `apps/desktop/src/main/core/executor.ts` for the write path.
 */
export interface AiSuggestion<T> {
  value: T;
  appliedAt: string | null;
  reasoning: string;
  promptHash?: string;
}

export interface AiSuggestionsForSave {
  tags?: AiSuggestion<string[]>;
  caption?: AiSuggestion<string>;
}

export const saves = sqliteTable(
  "saves",
  {
    id: text("id").primaryKey(),
    source: text("source").$type<Source>().notNull(),
    sourceId: text("source_id").notNull(),
    url: text("url").notNull(),
    title: text("title"),
    description: text("description"),
    author: text("author"),
    notes: text("notes"),
    mediaUrl: text("media_url"),
    /** `pond://<id>/<file>` URI resolving to the local copy in the library. */
    blobUrl: text("blob_url"),
    mediaType: text("media_type").$type<MediaType>(),
    rawJson: text("raw_json", { mode: "json" }),
    tags: text("tags", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    aiTags: text("ai_tags", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    aiCaption: text("ai_caption"),
    aiSuggestions: text("ai_suggestions", { mode: "json" })
      .$type<AiSuggestionsForSave | null>()
      .default(null),
    ocrText: text("ocr_text"),
    dominantColors: text("dominant_colors", { mode: "json" })
      .$type<DominantColor[] | null>()
      .default(null),
    /**
     * Ordered list of media files associated with this save. Entry 0 is the
     * cover. Rebuilt from each item's `metadata.json files[]` during scan.
     * Empty for pre-multi-media rows -- renderers should fall back to
     * `blobUrl` / `mediaUrl` in that case.
     */
    files: text("files", { mode: "json" })
      .$type<SaveFile[]>()
      .notNull()
      .default(sql`'[]'`),
    coverIndex: integer("cover_index").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    fileSize: integer("file_size"),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    embeddingUpdatedAt: integer("embedding_updated_at", {
      mode: "timestamp_ms",
    }),
    savedAt: integer("saved_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    sourceSourceIdUnique: unique("saves_source_source_id_unique").on(
      t.source,
      t.sourceId,
    ),
    savedAtIdx: index("saves_saved_at_idx").on(t.savedAt),
    sourceIdx: index("saves_source_idx").on(t.source),
    sizeIdx: index("saves_size_idx").on(t.fileSize),
    dimsIdx: index("saves_dims_idx").on(t.width, t.height),
    archivedIdx: index("saves_archived_idx").on(t.archivedAt),
    deletedIdx: index("saves_deleted_idx").on(t.deletedAt),
  }),
);

/**
 * Tags as a first-class entity. The `saves.tags` JSON array is the
 * authoritative list for a single save; this table keeps a de-duplicated
 * set with colour / group metadata (Eagle-style).
 */
export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    color: text("color"),
    group: text("group"),
    usageCount: integer("usage_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    groupIdx: index("tags_group_idx").on(t.group),
  }),
);

/**
 * Append-only mutation log. Linear's `SyncAction`. The autoincrement id
 * doubles as `lastSyncId` — monotonic per pond install.
 */
export const SYNC_ACTIONS = ["I", "U", "D", "A"] as const;
export type SyncActionKind = (typeof SYNC_ACTIONS)[number];

export const SYNC_MODELS = ["save", "tag", "settings"] as const;
export type SyncModel = (typeof SYNC_MODELS)[number];

export const SYNC_ACTORS = ["user", "ai", "system"] as const;
export type SyncActor = (typeof SYNC_ACTORS)[number];

export const syncActions = sqliteTable(
  "sync_actions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    batchId: text("batch_id"),
    modelName: text("model_name").$type<SyncModel>().notNull(),
    modelId: text("model_id").notNull(),
    action: text("action").$type<SyncActionKind>().notNull(),
    data: text("data", { mode: "json" }),
    prevData: text("prev_data", { mode: "json" }),
    actor: text("actor").$type<SyncActor>().notNull(),
    actorReason: text("actor_reason"),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    modelIdx: index("sync_actions_model_idx").on(t.modelName, t.modelId, t.id),
    actorIdx: index("sync_actions_actor_idx").on(t.actor, t.id),
    batchIdx: index("sync_actions_batch_idx").on(t.batchId),
  }),
);

/**
 * Cache-before-commit table: every `Transaction` is written here BEFORE
 * disk/index writes run, then deleted on success. On startup, anything
 * left here is replayed — gives us crash-safety without journaling disk
 * writes separately.
 *
 * Adapted from Linear's client-side transaction queue.
 */
export const transactionsLog = sqliteTable(
  "__transactions",
  {
    id: text("id").primaryKey(),
    batchId: text("batch_id"),
    tx: text("tx", { mode: "json" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    committedAt: integer("committed_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    batchIdx: index("transactions_batch_idx").on(t.batchId),
  }),
);

/**
 * Index-vs-disk reconciliation. On startup we walk `items/*.info/
 * metadata.json` and re-index anything whose mtime is newer than the row
 * here. Lets `scanLibrary()` be O(changed files) instead of O(all files).
 */
export const libraryScan = sqliteTable("library_scan", {
  itemId: text("item_id").primaryKey(),
  mtimeMs: integer("mtime_ms").notNull(),
  scannedAt: integer("scanned_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const AI_AUTONOMY_LEVELS = ["off", "suggest", "auto-apply"] as const;
export type AiAutonomyLevel = (typeof AI_AUTONOMY_LEVELS)[number];

export interface AiAutonomy {
  tagging: AiAutonomyLevel;
  additionalGuidance: string;
}

export const DEFAULT_AI_AUTONOMY: AiAutonomy = {
  tagging: "auto-apply",
  additionalGuidance: "",
};

export const settings = sqliteTable("settings", {
  id: text("id").primaryKey().default("singleton"),
  aiAutonomy: text("ai_autonomy", { mode: "json" })
    .$type<AiAutonomy>()
    .notNull(),
  libraryRoot: text("library_root"),
  onboarded: integer("onboarded", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export type Save = typeof saves.$inferSelect;
export type NewSave = typeof saves.$inferInsert;
export type Tag = typeof tags.$inferSelect;
export type NewTag = typeof tags.$inferInsert;
export type SyncAction = typeof syncActions.$inferSelect;
export type NewSyncAction = typeof syncActions.$inferInsert;
export type TransactionRow = typeof transactionsLog.$inferSelect;
export type LibraryScanRow = typeof libraryScan.$inferSelect;
export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;
