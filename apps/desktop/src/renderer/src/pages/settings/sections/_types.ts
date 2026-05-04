/**
 * Shared types lifted from the original monolithic settings page.
 * Kept in their own module so the registry + multiple section files
 * can import them without pulling each other in transitively.
 */

export const AUTH_WALLED_SOURCES = [
  { id: "twitter", label: "X / Twitter" },
  { id: "instagram", label: "Instagram" },
  { id: "cosmos", label: "Cosmos" },
  { id: "tiktok", label: "TikTok" },
  { id: "reddit", label: "Reddit" },
] as const;
export type AuthWalledSource = (typeof AUTH_WALLED_SOURCES)[number]["id"];

export const PUBLIC_SOURCES = [
  { id: "pinterest", label: "Pinterest" },
  { id: "arena", label: "Are.na" },
  { id: "youtube", label: "YouTube" },
] as const;
export type PublicSource = (typeof PUBLIC_SOURCES)[number]["id"];

/** Every source with a settings page (auth-walled + public). */
export const ALL_SOURCES = [...AUTH_WALLED_SOURCES, ...PUBLIC_SOURCES] as const;
export type AnySource = (typeof ALL_SOURCES)[number]["id"];

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

export function isAuthWalled(source: string): source is AuthWalledSource {
  return AUTH_WALLED_SOURCES.some((s) => s.id === source);
}
