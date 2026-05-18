import type { Source } from "@pond/schema/db";
import type { SessionImportResponse } from "@pond/schema/session";

export const POND_EVENT = "pond:capture";

export const DEFAULT_PORT = 41610;

export interface PondCapturePayload {
  url: string;
  trigger?: string;
}

export type PondMessage =
  | { kind: "capture"; payload: PondCapturePayload }
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
  port: number;
  apiKey: string;
  enabled: Record<
    | "twitter"
    | "instagram"
    | "pinterest"
    | "arena"
    | "cosmos"
    | "tiktok"
    | "youtube",
    boolean
  >;
}

export const DEFAULT_SETTINGS: PondSettings = {
  port: DEFAULT_PORT,
  apiKey: "",
  enabled: {
    twitter: true,
    instagram: true,
    pinterest: true,
    arena: true,
    cosmos: true,
    tiktok: true,
    youtube: true,
  },
};

// Forward-only migration. Old installs stored an `endpoint` URL string;
// new installs store the port and derive the URL at call time. Strip any
// legacy `endpoint` field, salvage the port from it when possible.
export function normalizeStoredSettings(stored: unknown): PondSettings {
  const base = (stored ?? {}) as Partial<PondSettings> & {
    endpoint?: string;
    port?: number;
  };
  const port =
    typeof base.port === "number" && Number.isFinite(base.port)
      ? base.port
      : (portFromLegacyEndpoint(base.endpoint) ?? DEFAULT_SETTINGS.port);
  return {
    ...DEFAULT_SETTINGS,
    ...base,
    port,
    enabled: { ...DEFAULT_SETTINGS.enabled, ...(base.enabled ?? {}) },
  };
}

function portFromLegacyEndpoint(endpoint: string | undefined): number | null {
  if (!endpoint) return null;
  try {
    const u = new URL(endpoint);
    const p = Number.parseInt(u.port || "0", 10);
    return Number.isFinite(p) && p > 0 ? p : null;
  } catch {
    return null;
  }
}

export function enqueueUrl(port: number): string {
  return `http://127.0.0.1:${port}/api/v2/enqueue`;
}

export function libraryInfoUrl(port: number): string {
  return `http://127.0.0.1:${port}/api/v2/library/info`;
}

export function sessionImportUrl(port: number): string {
  return `http://127.0.0.1:${port}/api/v2/session/import`;
}

export function appInfoUrl(port: number): string {
  return `http://127.0.0.1:${port}/api/v2/app/info`;
}
