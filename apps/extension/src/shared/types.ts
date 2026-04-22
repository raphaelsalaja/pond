import type { IngestPayload } from "@pond/schema/ingest";

export const POND_EVENT = "pond:capture";

export type PondMessage =
  | { kind: "capture"; payload: IngestPayload }
  | { kind: "manualCapture"; url: string }
  | { kind: "log"; level: "info" | "warn" | "error"; message: string; data?: unknown };

export interface PondSettings {
  endpoint: string;
  apiKey: string;
  enabled: Record<
    "twitter" | "instagram" | "pinterest" | "arena" | "cosmos",
    boolean
  >;
}

export const DEFAULT_SETTINGS: PondSettings = {
  endpoint: "http://localhost:3000/api/ingest",
  apiKey: "",
  enabled: {
    twitter: true,
    instagram: true,
    pinterest: true,
    arena: true,
    cosmos: true,
  },
};
