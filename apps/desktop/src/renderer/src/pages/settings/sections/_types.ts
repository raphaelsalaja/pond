export const AUTH_WALLED_SOURCES = [
  { id: "twitter", label: "X (Twitter)" },
  { id: "instagram", label: "Instagram" },
  { id: "tiktok", label: "TikTok" },
  { id: "pinterest", label: "Pinterest" },
  { id: "youtube", label: "YouTube" },
] as const;
export type AuthWalledSource = (typeof AUTH_WALLED_SOURCES)[number]["id"];

export const PUBLIC_PROFILE_SOURCES = [
  { id: "cosmos", label: "Cosmos" },
  { id: "arena", label: "Are.na" },
] as const;
export type PublicProfileSource = (typeof PUBLIC_PROFILE_SOURCES)[number]["id"];

export const ALL_SOURCES = [
  ...AUTH_WALLED_SOURCES.map((s) => ({ ...s, kind: "auth-walled" }) as const),
  ...PUBLIC_PROFILE_SOURCES.map(
    (s) => ({ ...s, kind: "public-profile" }) as const,
  ),
] as const;
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

export type AiAutonomy = "off" | "suggest" | "auto-apply";

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

export interface AiProviderConfig {
  kind: "off" | "local" | "gateway" | "direct";
  baseUrl: string;
  models: { vision: string; summary: string; embedding: string };
  embeddingDim: number;
  dailyBudgetUsd: number | null;
  sendImages: boolean;
}

export interface SettingsRow {
  id: string;
  aiAutonomy: {
    tagging: AiAutonomy;
    additionalGuidance: string;
  };
  aiProvider?: AiProviderConfig;
  videoDownload: VideoDownloadPrefs;
  libraryRoot: string | null;
}
