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
    article: true,
  },
};

/** Loopback probe used by the popup to detect a running desktop app. */
export const APP_INFO_URL = "http://127.0.0.1:41610/api/v2/app/info";
