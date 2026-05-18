import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  unique,
} from "drizzle-orm/sqlite-core";

export const SOURCES = [
  "twitter",
  "instagram",
  "pinterest",
  "arena",
  "cosmos",
  "tiktok",
  "youtube",
] as const;
export type Source = (typeof SOURCES)[number];

export const MEDIA_TYPES = ["image", "video", "mixed", "link"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const SAVE_STATUSES = ["ingesting", "complete", "failed"] as const;
export type SaveStatus = (typeof SAVE_STATUSES)[number];

export const OPS = [
  "harvest_metadata",
  "capture_tweet",
  "fetch_blobs",
  "fetch_video_ytdlp",
  "ensure_poster",
  "fetch_avatar",
  "finalize",
] as const;
export type Op = (typeof OPS)[number];

export const TASK_STATUSES = [
  "pending",
  "running",
  "done",
  "failed",
  "blocked",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export interface SaveFile {
  kind: string;
  path: string;
  sha256: string;
  size: number;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
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
    lang: text("lang"),
    siteName: text("site_name"),
    publishedAt: integer("published_at", { mode: "timestamp_ms" }),
    notes: text("notes"),
    mediaUrl: text("media_url"),
    mediaType: text("media_type").$type<MediaType>(),
    rawJson: text("raw_json", { mode: "json" }),
    tags: text("tags", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    files: text("files", { mode: "json" })
      .$type<SaveFile[]>()
      .notNull()
      .default(sql`'[]'`),
    coverIndex: integer("cover_index").notNull().default(0),
    width: integer("width"),
    height: integer("height"),
    fileSize: integer("file_size"),
    status: text("status")
      .$type<SaveStatus>()
      .notNull()
      .default(sql`'ingesting'`),
    ingestStartedAt: integer("ingest_started_at", { mode: "timestamp_ms" }),
    ingestCompletedAt: integer("ingest_completed_at", { mode: "timestamp_ms" }),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
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
    deletedIdx: index("saves_deleted_idx").on(t.deletedAt),
    statusIdx: index("saves_status_idx").on(t.status),
  }),
);

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    saveId: text("save_id")
      .notNull()
      .references(() => saves.id, { onDelete: "cascade" }),
    op: text("op").$type<Op>().notNull(),
    status: text("status")
      .$type<TaskStatus>()
      .notNull()
      .default(sql`'pending'`),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(5),
    nextRunAt: integer("next_run_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    lastError: text("last_error"),
    payload: text("payload", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (t) => ({
    saveOpUnique: unique("tasks_save_op_unique").on(t.saveId, t.op),
    nextRunIdx: index("tasks_next_run_idx").on(t.status, t.nextRunAt),
    saveIdx: index("tasks_save_idx").on(t.saveId),
  }),
);

export const tags = sqliteTable(
  "tags",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull().unique(),
    color: text("color"),
    description: text("description"),
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

export const SYNC_ACTIONS = ["I", "U", "D", "A"] as const;
export type SyncActionKind = (typeof SYNC_ACTIONS)[number];

export const SYNC_MODELS = ["save", "tag", "settings"] as const;
export type SyncModel = (typeof SYNC_MODELS)[number];

export const SYNC_ACTORS = ["user", "system"] as const;
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

export const libraryScan = sqliteTable("library_scan", {
  itemId: text("item_id").primaryKey(),
  mtimeMs: integer("mtime_ms").notNull(),
  scannedAt: integer("scanned_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

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

export const SYNC_FREQUENCIES = [
  "hourly",
  "every6h",
  "daily",
  "weekly",
] as const;
export type SyncFrequency = (typeof SYNC_FREQUENCIES)[number];

export interface GlobalSyncPrefs {
  enabled: boolean;
  frequency: SyncFrequency;
  anchorTime: string;
  weekdays: number[];
  quietHours: { start: string; end: string } | null;
  onlyOnAcPower: boolean;
  onlyOnWifi: boolean;
  lastFireAt: string | null;
}

export const DEFAULT_GLOBAL_SYNC_PREFS: GlobalSyncPrefs = {
  enabled: false,
  frequency: "daily",
  anchorTime: "09:00",
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  quietHours: null,
  onlyOnAcPower: false,
  onlyOnWifi: false,
  lastFireAt: null,
};

export interface SourceSyncPrefs {
  lastSyncedAt: string | null;
  lastError: string | null;
}

export const DEFAULT_SOURCE_SYNC_PREFS: SourceSyncPrefs = {
  lastSyncedAt: null,
  lastError: null,
};

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
    videoDone: boolean;
    sound: boolean;
  };
  trash: {
    autoEmptyDays: number | null;
    confirmBeforeEmpty: boolean;
  };
  library: {
    displayName: string;
  };
  quickCapture: {
    menuBarIcon: boolean;
    launchAtLogin: boolean;
  };
  saveBehavior: {
    autoTag: boolean;
    dedupeByUrl: boolean;
    defaultTags: string[];
  };
  search: {
    recencyBoost: boolean;
    resultLimit: number;
  };
  backups: {
    schedule: "never" | "daily" | "weekly" | "monthly";
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
  sync: {
    global: GlobalSyncPrefs;
    sources: Partial<Record<Source, SourceSyncPrefs>>;
    handles: Partial<Record<Source, string>>;
  };
  storage: {
    guardsEnabled: boolean;
    maxLibraryGb: number | null;
    warnAtPercent: number;
    action: "warn" | "pauseSync" | "pauseVideo";
    watchIntervalMinutes: number;
  };
  views: {
    saved: SavedFilterView[];
  };
}

export interface SavedFilterView {
  id: string;
  name: string;
  params: Record<string, string>;
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
    menuBarIcon: true,
    launchAtLogin: false,
  },
  saveBehavior: {
    autoTag: true,
    dedupeByUrl: true,
    defaultTags: [],
  },
  search: {
    recencyBoost: false,
    resultLimit: 200,
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
  sync: {
    global: DEFAULT_GLOBAL_SYNC_PREFS,
    sources: {},
    handles: {},
  },
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
  videoDownload: text("video_download", { mode: "json" })
    .$type<VideoDownloadSettings>()
    .notNull()
    .default(sql`'${sql.raw(JSON.stringify(DEFAULT_VIDEO_DOWNLOAD))}'`),
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
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
