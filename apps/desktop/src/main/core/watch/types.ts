import type { Source } from "@pond/schema/db";

export type FetchWatchPage = (
  url: string,
  init: RequestInit,
) => Promise<Response>;

export interface WatchEntry {
  url: string;
  sourceId: string;
  source?: Source;
}

export type WatchHarvestResult =
  | { ok: true; entries: Array<WatchEntry> }
  | {
      ok: false;
      reason:
        | "not_found"
        | "auth_required"
        | "rate_limited"
        | "timeout"
        | "unavailable"
        | "unknown";
    };
