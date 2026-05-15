import type { Source } from "@pond/schema/db";
import type { IngestPayload } from "@pond/schema/ingest";
import type { SessionImportResponse } from "@pond/schema/session";

export const POND_EVENT = "pond:capture";

export type PondMessage =
  | { kind: "capture"; payload: IngestPayload }
  | { kind: "manualCapture"; url: string }
  | { kind: "pushSession"; source: Source }
  | {
      kind: "log";
      level: "info" | "warn" | "error";
      message: string;
      data?: unknown;
    };

export type PushSessionResult =
  | { ok: true; data: SessionImportResponse }
  | {
      ok: false;
      reason: "unpaired" | "no_cookies" | "network";
      detail?: string;
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

export const APP_INFO_URL = "http://127.0.0.1:41610/api/v2/app/info";

export const LIBRARY_INFO_URL = "http://127.0.0.1:41610/api/v2/library/info";

export const SESSION_IMPORT_URL =
  "http://127.0.0.1:41610/api/v2/session/import";
