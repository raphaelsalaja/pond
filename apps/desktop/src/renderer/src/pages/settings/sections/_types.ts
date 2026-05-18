export const AUTH_WALLED_SOURCES = [
  { id: "twitter", label: "X (Twitter)" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "pinterest", label: "Pinterest" },
  { id: "youtube", label: "YouTube" },
  { id: "cosmos", label: "Cosmos" },
  { id: "arena", label: "Are.na" },
] as const;
export type AuthWalledSource = (typeof AUTH_WALLED_SOURCES)[number]["id"];

// Every source connects the same way now — the extension pushes cookies,
// the desktop derives any per-account info (e.g. the user's handle) from
// the cookied session in the hidden window.
export const ALL_SOURCES = AUTH_WALLED_SOURCES.map(
  (s) => ({ ...s, kind: "auth-walled" }) as const,
);
export type AnySource = (typeof ALL_SOURCES)[number]["id"];

export const SOURCE_DESCRIPTIONS: Record<AnySource, string> = {
  twitter: "Your trusted digital town square.",
  instagram: "Capture and share the world's moments.",
  cosmos: "Curate clusters and visual references.",
  tiktok: "Short videos worth coming back to.",
  pinterest: "Pin ideas worth keeping.",
  arena: "Connect blocks across channels.",
  youtube: "Videos, playlists, and watch-later.",
};

export interface VideoDownloadPrefs {
  enabled: boolean;
  maxHeight: number | null;
  maxFileSizeMb: number | null;
}

export const DEFAULT_VIDEO_DOWNLOAD: VideoDownloadPrefs = {
  enabled: true,
  maxHeight: 1080,
  maxFileSizeMb: 500,
};

export interface SettingsRow {
  id: string;
  videoDownload: VideoDownloadPrefs;
  libraryRoot: string | null;
}
