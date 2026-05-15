import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
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
  "article",
] as const;
export type Source = (typeof SOURCES)[number];

export const MEDIA_TYPES = ["image", "video", "link", "article"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export interface DominantColor {
  hex: string;
  weight: number;
}

export interface SaveFile {
  kind: string;
  path: string;
  sha256: string;
  size: number;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
}

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

export const NSFW_LABELS = [
  "drawing",
  "hentai",
  "neutral",
  "porn",
  "sexy",
] as const;
export type NsfwLabel = (typeof NSFW_LABELS)[number];

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
    aiTags: text("ai_tags", { mode: "json" })
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'`),
    aiCaption: text("ai_caption"),
    aiSuggestions: text("ai_suggestions", { mode: "json" })
      .$type<AiSuggestionsForSave | null>()
      .default(null),
    classification: text("classification").$type<SaveClassification | null>(),
    aiSummary: text("ai_summary"),
    articleHtml: text("article_html"),
    articleText: text("article_text"),
    articleReadingMinutes: integer("article_reading_minutes"),
    annotations: text("annotations", { mode: "json" })
      .$type<SaveAnnotations | null>()
      .default(null),
    ocrText: text("ocr_text"),
    dominantColors: text("dominant_colors", { mode: "json" })
      .$type<DominantColor[] | null>()
      .default(null),
    blurDataUrl: text("blur_data_url"),
    nsfwScore: real("nsfw_score"),
    nsfwLabel: text("nsfw_label").$type<NsfwLabel | null>(),
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

export const DEFAULT_AI_AUTONOMY: AiAutonomy = {
  tagging: "suggest",
  additionalGuidance: "",
};

export const AI_PROVIDER_KINDS = ["off", "local", "gateway", "direct"] as const;
export type AiProviderKind = (typeof AI_PROVIDER_KINDS)[number];

export interface AiProviderConfig {
  kind: AiProviderKind;
  baseUrl: string;
  models: {
    vision: string;
    summary: string;
    embedding: string;
  };
  embeddingDim: number;
  dailyBudgetUsd: number | null;
  sendImages: boolean;
}

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
    aiSuggestion: boolean;
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
    hybrid: boolean;
    recencyBoost: boolean;
    resultLimit: number;
  };
  captions: {
    autoAltText: boolean;
    videoTranscripts: boolean;
    language: string;
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
  aiPersonality: {
    tone: "neutral" | "playful" | "terse" | "academic";
    tagStyle: "kebab" | "snake" | "natural";
    systemPrompt: string;
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
  safety: {
    blur: "on" | "off";
    threshold: number;
    categories: {
      porn: boolean;
      hentai: boolean;
      sexy: boolean;
    };
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
  safety: {
    blur: "on",
    threshold: 0.6,
    categories: {
      porn: true,
      hentai: true,
      sexy: false,
    },
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
  aiProvider: text("ai_provider", { mode: "json" })
    .$type<AiProviderConfig>()
    .notNull()
    .default(sql`'${sql.raw(JSON.stringify(DEFAULT_AI_PROVIDER))}'`),
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
