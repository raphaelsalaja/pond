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
  "reddit",
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
  ocr?: AiSuggestion<string>;
  classification?: AiSuggestion<SaveClassification>;
  summary?: AiSuggestion<string>;
}

/**
 * Mymind-style classification of what the save *is*. Drives reader mode,
 * card chrome, and filter chips. Free-form `other` covers anything the
 * classifier isn't sure about.
 */
export const SAVE_CLASSIFICATIONS = [
  "article",
  "product",
  "recipe",
  "quote",
  "video",
  "image",
  "code",
  "other",
] as const;
export type SaveClassification = (typeof SAVE_CLASSIFICATIONS)[number];

/** Where a highlight starts/ends in the cleaned article text. */
export interface TextHighlight {
  id: string;
  start: number;
  end: number;
  text: string;
  note?: string;
  color?: string;
  createdAt: string;
}

export interface SaveAnnotations {
  highlights?: TextHighlight[];
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
    /**
     * Page language (BCP-47), promoted from `raw.<source>.lang` /
     * `<html lang>` / OG. Phase-4 universal field. Optional; older
     * rows pre-migration carry `null`.
     */
    lang: text("lang"),
    /**
     * Human display name of the source site (`og:site_name` on
     * articles, `"Twitter / X"` on tweets, etc.). Promoted from
     * `raw.<source>.siteName`. Phase-4 universal field.
     */
    siteName: text("site_name"),
    /** Author-side post timestamp (ISO-8601 string in metadata.json,
     * Date here). Distinct from `savedAt` (user save time) and
     * `createdAt` (row insert time). */
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
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
    /**
     * AI-assigned content type — drives reader mode and card chrome.
     * `null` until the classifier has run for this save.
     */
    classification: text("classification").$type<SaveClassification | null>(),
    /** Short AI-generated summary used in cards and the inbox preview. */
    aiSummary: text("ai_summary"),
    /**
     * Cleaned article HTML extracted at ingest time via Readability.
     * Stored alongside the index so reader mode works offline forever.
     * `null` for non-article saves.
     */
    articleHtml: text("article_html"),
    /** Plain-text version of the article body, for FTS + AI summarisation. */
    articleText: text("article_text"),
    /** Article reading-time estimate in minutes. */
    articleReadingMinutes: integer("article_reading_minutes"),
    /**
     * User annotations: text highlights, video timestamps. Stored as
     * a single JSON blob so the on-disk `metadata.json` stays
     * self-contained. See `SaveAnnotations`.
     */
    annotations: text("annotations", { mode: "json" })
      .$type<SaveAnnotations | null>()
      .default(null),
    ocrText: text("ocr_text"),
    dominantColors: text("dominant_colors", { mode: "json" })
      .$type<DominantColor[] | null>()
      .default(null),
    /**
     * Base64-encoded `data:image/jpeg;...` of a tiny (16-px) blurred
     * preview of the cover. Painted as the placeholder in card thumbs
     * so a still-loading image already shows a blurred snapshot of its
     * own content (Next.js `placeholder="blur"` / Eagle behaviour).
     * Generated by the always-local colors enrichment job.
     */
    blurDataUrl: text("blur_data_url"),
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

export const AI_AUTONOMY_LEVELS = [
  "off",
  "suggest",
  "auto-apply",
  "auto",
] as const;
export type AiAutonomyLevel = (typeof AI_AUTONOMY_LEVELS)[number];

export interface AiAutonomy {
  tagging: AiAutonomyLevel;
  additionalGuidance: string;
}

/**
 * `suggest` is the README-philosophy default — every AI write lands in
 * `aiSuggestions` first and the user accepts it from the inbox. Users
 * can flip to `auto` for silent enrichment after they trust the model.
 */
export const DEFAULT_AI_AUTONOMY: AiAutonomy = {
  tagging: "suggest",
  additionalGuidance: "",
};

/**
 * Provider tier for the enrichment worker. The job code never touches
 * this directly — it goes through `enrich/provider.ts` which returns
 * an OpenAI-compatible HTTP client based on this config.
 */
export const AI_PROVIDER_KINDS = ["off", "local", "gateway", "direct"] as const;
export type AiProviderKind = (typeof AI_PROVIDER_KINDS)[number];

export interface AiProviderConfig {
  kind: AiProviderKind;
  /** Default `http://127.0.0.1:11434/v1` for Ollama / LM Studio. */
  baseUrl: string;
  /**
   * Model identifiers per task. Lets the user pick a smaller text-only
   * model for summary while keeping a vision model for caption + OCR.
   */
  models: {
    vision: string;
    summary: string;
    embedding: string;
  };
  /**
   * Embedding output dimension. Has to match the model — local
   * `nomic-embed-text` is 768, OpenAI `text-embedding-3-small` is 1536.
   * Switching dims triggers a re-embed flow that recreates `saves_vec`.
   */
  embeddingDim: number;
  /** USD per day budget cap; cloud tiers only. `null` = unlimited. */
  dailyBudgetUsd: number | null;
  /** When false, never send images to a cloud provider. Local always sends. */
  sendImages: boolean;
}

/** Sensible default — Local Ollama with the most common small models. */
export const DEFAULT_AI_PROVIDER: AiProviderConfig = {
  kind: "off",
  baseUrl: "http://127.0.0.1:11434/v1",
  models: {
    vision: "llava:7b",
    summary: "llama3.2:3b",
    embedding: "nomic-embed-text",
  },
  embeddingDim: 768,
  dailyBudgetUsd: null,
  sendImages: true,
};

/**
 * Background enrichment queue. One row per pending / failed job. Each
 * job is keyed by `(saveId, kind)` so retries idempotently overwrite.
 */
export const ENRICH_JOB_KINDS = [
  "colors",
  "article",
  "vision",
  "embed",
] as const;
export type EnrichJobKind = (typeof ENRICH_JOB_KINDS)[number];

export const ENRICH_JOB_STATES = [
  "pending",
  "running",
  "done",
  "error",
  "skipped",
] as const;
export type EnrichJobState = (typeof ENRICH_JOB_STATES)[number];

export const enrichJobs = sqliteTable(
  "enrich_jobs",
  {
    id: text("id").primaryKey(),
    saveId: text("save_id").notNull(),
    kind: text("kind").$type<EnrichJobKind>().notNull(),
    state: text("state").$type<EnrichJobState>().notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    nextAttemptAt: integer("next_attempt_at", {
      mode: "timestamp_ms",
    }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    saveKindUnique: unique("enrich_jobs_save_kind_unique").on(t.saveId, t.kind),
    stateIdx: index("enrich_jobs_state_idx").on(t.state),
    nextIdx: index("enrich_jobs_next_idx").on(t.nextAttemptAt),
  }),
);

export type EnrichJob = typeof enrichJobs.$inferSelect;
export type NewEnrichJob = typeof enrichJobs.$inferInsert;

/**
 * User-tunable knobs for the bundled yt-dlp pipeline.
 *
 * - `enabled` toggles the background auto-download queue. Off = the
 *   extension's poster JPG is the only media that ever lands on disk
 *   (drastically reduces bandwidth + disk usage). The user can still
 *   force a single-card download via the Refresh button — that path
 *   bypasses this flag because it's an explicit user action.
 * - `maxHeight` caps the resolution we ask yt-dlp to fetch. `null`
 *   means "no cap"; otherwise we use the standard YouTube ladder
 *   (480 / 720 / 1080 / 1440 / 2160). Lower = smaller files, faster
 *   downloads, less GPU on playback.
 * - `maxFileSizeMb` is yt-dlp's `--max-filesize` guardrail. Prevents
 *   a runaway 4-hour 1080p stream from filling the disk before we
 *   notice. `null` removes the cap.
 */
export interface VideoDownloadSettings {
  enabled: boolean;
  maxHeight: number | null;
  maxFileSizeMb: number | null;
}

export const DEFAULT_VIDEO_DOWNLOAD: VideoDownloadSettings = {
  enabled: true,
  maxHeight: 1080,
  maxFileSizeMb: 500,
};

/**
 * Cadence options for the per-source background sync. Floor is
 * 15 minutes — anything tighter risks rate-limiting / soft-bans on
 * the upstream sources, and provides no real value for a personal
 * archive.
 */
export const SYNC_CADENCES = ["off", "15min", "hourly", "6h", "daily"] as const;
export type SyncCadence = (typeof SYNC_CADENCES)[number];

/**
 * Per-source sync settings. Initially populated for Twitter only; other
 * sources stay at `cadence: "off"` until their bookmarks/saves
 * harvesters land. Persisted under `prefs.sync[<source>]`.
 *
 * - `enabled` is the master switch for the source. Defaults to `false`
 *   so adding sync to the codebase doesn't immediately start hitting
 *   live sites for users who never opt in.
 * - `cadence` is the cron schedule. The cron itself is registered in
 *   `main/index.ts → registerSyncCron` and only fires when both
 *   `enabled === true` and `cadence !== "off"`.
 * - `lastSyncedAt` is the ISO-string tail of the last successful run.
 *   The orchestrator updates it after each successful pass.
 * - `lastError` is set when the most recent run hit a known terminal
 *   condition (auth wall, fatal navigation error). Cleared on next
 *   success.
 *
 * Sync has exactly one mode: walk the source's full list and import
 * anything not already in the library. There is no "incremental vs
 * backfill" — every cron tick is the same operation, capped only by
 * a per-run safety ceiling so a single pass can't sit there forever.
 */
export interface SourceSyncPrefs {
  enabled: boolean;
  cadence: SyncCadence;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export const DEFAULT_SOURCE_SYNC_PREFS: SourceSyncPrefs = {
  enabled: false,
  cadence: "off",
  lastSyncedAt: null,
  lastError: null,
};

/**
 * Section-keyed user preferences blob. Stored as one JSON column on the
 * `settings` singleton. We intentionally keep this separate from the
 * already-typed columns above (`aiAutonomy`, `aiProvider`, `videoDownload`)
 * so adding a new pref bucket never costs a migration.
 *
 * See [the settings overhaul plan](settings-page-overhaul) for which
 * page each sub-key powers.
 */
export interface Prefs {
  preferences: {
    theme: "system" | "light" | "dark";
    pointerCursors: boolean;
    convertEmoticons: boolean;
  };
  profile: {
    displayName: string;
    avatarPath: string | null;
  };
  notifications: {
    saveComplete: boolean;
    refreshFailed: boolean;
    aiSuggestion: boolean;
    videoDone: boolean;
    sound: boolean;
  };
  trash: {
    /** `null` = never auto-empty. */
    autoEmptyDays: number | null;
    confirmBeforeEmpty: boolean;
  };
  library: {
    /** Friendly display name shown in the title bar / exports. */
    displayName: string;
  };
  quickCapture: {
    menuBarIcon: boolean;
    launchAtLogin: boolean;
  };
  saveBehavior: {
    autoTag: boolean;
    dedupeByUrl: boolean;
    /** Tags applied to every new save before any AI runs. */
    defaultTags: string[];
  };
  search: {
    hybrid: boolean;
    recencyBoost: boolean;
    resultLimit: number;
  };
  captions: {
    autoAltText: boolean;
    videoTranscripts: boolean;
    /** BCP-47 hint passed to vision/transcription jobs. */
    language: string;
  };
  backups: {
    schedule: "never" | "daily" | "weekly" | "monthly";
    /** How many snapshot zips to keep before pruning the oldest. */
    retainCount: number;
  };
  api: {
    port: number;
    bindAddress: "loopback" | "lan";
    allowedOrigins: string[];
  };
  updates: {
    channel: "stable" | "beta";
    autoInstall: boolean;
  };
  developer: {
    verboseLogging: boolean;
  };
  /**
   * AI personality knobs — folded into the AI page rather than being a
   * sibling settings bucket so all model behaviour lives together.
   */
  aiPersonality: {
    tone: "neutral" | "playful" | "terse" | "academic";
    tagStyle: "kebab" | "snake" | "natural";
    systemPrompt: string;
  };
  /**
   * Per-source background sync settings. Each entry is a `SourceSyncPrefs`
   * record; absent entries default to off. The runtime checks
   * `prefs.sync[source]?.enabled === true` before scheduling anything,
   * so sources we haven't built harvesters for stay dormant by default.
   */
  sync: Partial<Record<Source, SourceSyncPrefs>>;
  /**
   * Storage limit watcher. The main-process watcher periodically
   * reads on-disk library size against `maxLibraryGb` and the
   * `warnAtPercent` threshold; when crossed, the configured `action`
   * fires (warn-only, pause source syncs, or pause auto video
   * downloads). Disabled by default — guards only kick in when the
   * user opts in from Settings → Storage.
   *
   * - `guardsEnabled` is the master switch. When false the watcher
   *   skips its work entirely.
   * - `maxLibraryGb` is the hard cap in gibibytes. `null` means "no
   *   cap"; the warn threshold then fires off the configured percentage
   *   of the current library size which is meaningless, so the renderer
   *   should hide the warn slider when the cap is null.
   * - `warnAtPercent` is the warn threshold (50–100). Crossing it but
   *   staying under the cap surfaces a warning state without applying
   *   the action.
   * - `action` is the runtime response when the cap is crossed.
   * - `watchIntervalMinutes` controls the polling cadence
   *   (clamped 1..60).
   */
  storage: {
    guardsEnabled: boolean;
    maxLibraryGb: number | null;
    warnAtPercent: number;
    action: "warn" | "pauseSync" | "pauseVideo";
    watchIntervalMinutes: number;
  };
  /**
   * User-saved filter combinations. Each entry captures a snapshot of
   * the filter / operator URL params under a friendly name. Picking
   * one from the saved-filters popover replaces the active chip bar
   * on the current saves view; non-filter URL keys (search query,
   * sort, layout) are preserved.
   */
  views: {
    saved: SavedFilterView[];
  };
}

export interface SavedFilterView {
  id: string;
  name: string;
  /** Filter & operator URL params only — see `extractFilterParams`. */
  params: Record<string, string>;
  /** Epoch milliseconds. */
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_PREFS: Prefs = {
  preferences: {
    theme: "system",
    pointerCursors: false,
    convertEmoticons: true,
  },
  profile: {
    displayName: "",
    avatarPath: null,
  },
  notifications: {
    saveComplete: true,
    refreshFailed: true,
    aiSuggestion: true,
    videoDone: true,
    sound: false,
  },
  trash: {
    autoEmptyDays: null,
    confirmBeforeEmpty: true,
  },
  library: {
    displayName: "My Pond",
  },
  quickCapture: {
    // Pond is a menu-bar app first -- the tray is the primary surface,
    // so default it on. Users who explicitly hide it via Settings → Quick
    // capture keep that override because the persisted prefs blob wins
    // over DEFAULT_PREFS in mergePrefs().
    menuBarIcon: true,
    launchAtLogin: false,
  },
  saveBehavior: {
    autoTag: true,
    dedupeByUrl: true,
    defaultTags: [],
  },
  search: {
    hybrid: true,
    recencyBoost: false,
    resultLimit: 200,
  },
  captions: {
    autoAltText: true,
    videoTranscripts: false,
    language: "en",
  },
  backups: {
    schedule: "never",
    retainCount: 4,
  },
  api: {
    port: 41610,
    bindAddress: "loopback",
    allowedOrigins: [],
  },
  updates: {
    channel: "stable",
    autoInstall: true,
  },
  developer: {
    verboseLogging: false,
  },
  aiPersonality: {
    tone: "neutral",
    tagStyle: "kebab",
    systemPrompt: "",
  },
  sync: {},
  storage: {
    guardsEnabled: false,
    maxLibraryGb: 50,
    warnAtPercent: 80,
    action: "warn",
    watchIntervalMinutes: 5,
  },
  views: {
    saved: [],
  },
};

export const settings = sqliteTable("settings", {
  id: text("id").primaryKey().default("singleton"),
  aiAutonomy: text("ai_autonomy", { mode: "json" })
    .$type<AiAutonomy>()
    .notNull(),
  /**
   * Provider tier + model picks + budget knobs. Single source of truth
   * for the enrichment worker. See `AiProviderConfig`.
   */
  aiProvider: text("ai_provider", { mode: "json" })
    .$type<AiProviderConfig>()
    .notNull()
    .default(sql`'${sql.raw(JSON.stringify(DEFAULT_AI_PROVIDER))}'`),
  videoDownload: text("video_download", { mode: "json" })
    .$type<VideoDownloadSettings>()
    .notNull()
    .default(sql`'${sql.raw(JSON.stringify(DEFAULT_VIDEO_DOWNLOAD))}'`),
  /**
   * Section-keyed user preferences. See `Prefs` interface.
   */
  prefs: text("prefs", { mode: "json" })
    .$type<Prefs>()
    .notNull()
    .default(sql`'${sql.raw(JSON.stringify(DEFAULT_PREFS))}'`),
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
