import type { Source } from "./db";
import type { ListKind } from "./list-kinds";

export type VideoCodec = "h264" | "hevc" | "av1" | "vp9" | "any";
export type AudioCodec = "aac" | "opus" | "any";
export type VideoContainer = "auto" | "mp4" | "mkv" | "webm" | "mov";
export type SubtitleMode = "off" | "download" | "embed";

export interface VideoDownloadSettings {
  enabled: boolean;
  maxHeight: number | null;
  maxFps: number | null;
  videoCodec: VideoCodec;
  audioCodec: AudioCodec;
  container: VideoContainer;
  maxFileSizeMb: number | null;
  subtitles: SubtitleMode;
  subtitleLang: string;
  embedMetadata: boolean;
  embedThumbnail: boolean;
  embedChapters: boolean;
  sponsorblockRemove: boolean;
}

export const DEFAULT_VIDEO_DOWNLOAD: VideoDownloadSettings = {
  enabled: true,
  maxHeight: 1080,
  maxFps: null,
  videoCodec: "h264",
  audioCodec: "aac",
  container: "auto",
  maxFileSizeMb: 500,
  subtitles: "off",
  subtitleLang: "en",
  embedMetadata: true,
  embedThumbnail: false,
  embedChapters: false,
  sponsorblockRemove: false,
};

export type ImageFormat = "original" | "jpeg" | "png" | "webp" | "avif";

export interface ImageDownloadSettings {
  maxLongEdge: number | null;
  format: ImageFormat;
  quality: number;
  lossless: boolean;
  progressive: boolean;
  preserveMetadata: boolean;
  maxFileSizeMb: number | null;
}

export const DEFAULT_IMAGE_DOWNLOAD: ImageDownloadSettings = {
  maxLongEdge: 2048,
  format: "original",
  quality: 80,
  lossless: false,
  progressive: false,
  preserveMetadata: false,
  maxFileSizeMb: 10,
};

/** A named list on a Source that an Account can import on its own, such as a Pinterest board. */
export interface ImportCollection {
  id: string;
  name: string;
}

/** What a save holds once captured; `text` is a post with no image or video. */
export const IMPORT_MEDIA_KINDS = ["image", "video", "text"] as const;
export type ImportMediaKind = (typeof IMPORT_MEDIA_KINDS)[number];

/** What an Account sync imports. An omitted part imports everything it covers. */
export interface ImportScope {
  listKinds?: ListKind[];
  /** Narrows the saved list to these collections. */
  collections?: ImportCollection[];
  mediaKinds?: ImportMediaKind[];
  /** Local calendar day (`YYYY-MM-DD`); posts published before it are skipped. */
  since?: string;
  /** False keeps collection saves out of Folders; omitted files each collection under its Source. */
  addToFolders?: boolean;
}

export interface SourceSyncPrefs {
  lastSyncedAt: string | null;
  lastError: string | null;
  highWaterMark: string | null;
  lastFullSyncAt: string | null;
  knownCount: number;
  /**
   * ISO timestamp while a run is in flight; still set at startup means the previous run was interrupted.
   * @see recoverInterruptedSyncs
   */
  runningSince: string | null;
  /** @deprecated Read only for X Accounts saved before `importScope`; use `importScope.listKinds`. */
  syncLikes?: boolean;
  /** Where an unfinished list backfill continues, so a list too long for one run still reaches its end. */
  resumeCursor?: string | null;
  /** Omitted means everything, which is how Accounts connected before scoped imports keep syncing. */
  importScope?: ImportScope;
  /** True on a newly connected Account until you confirm what to import. Sync waits while it is set. */
  importPending?: boolean;
  /** Pond Folder id per collection id, so renaming a Folder doesn't make sync create another. */
  collectionFolders?: Record<string, string>;
}

export const DEFAULT_SOURCE_SYNC_PREFS: SourceSyncPrefs = {
  lastSyncedAt: null,
  lastError: null,
  highWaterMark: null,
  lastFullSyncAt: null,
  knownCount: 0,
  runningSince: null,
};

export interface ConnectedAccount {
  id: string;
  source: Source;
  handle: string | null;
  /**
   * Stable platform user id from identity cookies (twitter `twid`, instagram/threads `ds_user_id`);
   * matches a pushed session to an account when the handle can't be probed. Null when the platform has no such cookie.
   */
  identityKey: string | null;
  label: string | null;
  avatarUrl?: string | null;
  avatarCheckedAt?: string | null;
  addedAt: string;
  sync: SourceSyncPrefs;
}

export type SyncAccounts = Record<string, ConnectedAccount>;

export type WatchKind =
  | "channel"
  | "user"
  | "group"
  | "playlist"
  | "board"
  | "cluster"
  | "list";

export interface WatchedAccount {
  id: string;
  source: Source;
  handle: string;
  kind?: WatchKind;
  label: string | null;
  avatarUrl?: string | null;
  avatarCheckedAt?: string | null;
  via: string | null;
  addedAt: string;
  sync: SourceSyncPrefs;
}

export type SyncWatches = Record<string, WatchedAccount>;

export interface ThemeDef {
  accent: string;
  background: string;
  foreground: string;
  contrast: number;
}

export type ThemeAppearance = "system" | "light" | "dark";

export type TweetCover = "media" | "screenshot";

export const DEFAULT_SYNC_CRON = { enabled: true, intervalHours: 12 } as const;

export const CONTRAST_MIN = 0;
export const CONTRAST_MAX = 100;
export const CONTRAST_DEFAULT = 50;

export const DEFAULT_LIGHT_THEME: ThemeDef = {
  accent: "#008FFF",
  background: "#ffffff",
  foreground: "#1B1B1B",
  contrast: CONTRAST_DEFAULT,
};

export const DEFAULT_DARK_THEME: ThemeDef = {
  accent: "#008FFF",
  background: "#0A0A0A",
  foreground: "#EEEEEE",
  contrast: CONTRAST_DEFAULT,
};

export const DEFAULT_LIGHT_PRESET_ID = "light";
export const DEFAULT_DARK_PRESET_ID = "dark";

export const DEFAULT_APP_ICON = "aqua";

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type SourceMetricDisplay = "card" | "chip";

export const DEFAULT_SOURCE_METRICS: string[] = [
  "itemsSynced",
  "successRate",
  "runsToday",
  "avgRun",
];
