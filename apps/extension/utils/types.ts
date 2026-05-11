import type { IngestPayload } from "@pond/schema/ingest";

export const POND_EVENT = "pond:capture";

export type PondMessage =
  | { kind: "capture"; payload: IngestPayload }
  | { kind: "manualCapture"; url: string }
  | {
      kind: "log";
      level: "info" | "warn" | "error";
      message: string;
      data?: unknown;
    };

export interface PondSettings {
  endpoint: string;
  apiKey: string;
  enabled: Record<
    | "twitter"
    | "instagram"
    | "pinterest"
    | "arena"
    | "cosmos"
    | "tiktok"
    | "youtube"
    | "reddit"
    | "article",
    boolean
  >;
}

export const DEFAULT_SETTINGS: PondSettings = {
  endpoint: "http://127.0.0.1:41610/api/v2/item/add",
  apiKey: "",
  enabled: {
    twitter: true,
    instagram: true,
    pinterest: true,
    arena: true,
    cosmos: true,
    tiktok: true,
    youtube: true,
    reddit: true,
    article: true,
  },
};

/** Loopback probe used by the popup to detect a running desktop app. */
export const APP_INFO_URL = "http://127.0.0.1:41610/api/v2/app/info";

/**
 * Authenticated probe used by the popup to verify the stored bearer token
 * and pull library name + counts for the status line. Distinguishes
 * "app not running" (fetch throws) from "wrong token" (401) — the
 * unauthenticated `APP_INFO_URL` can't tell those apart.
 */
export const LIBRARY_INFO_URL = "http://127.0.0.1:41610/api/v2/library/info";
