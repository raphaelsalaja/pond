import type { MediaType, Source } from "@pond/schema/db";

/**
 * `knownIds` keeps the harvester's dedupe set warm so a virtualised
 * re-render doesn't double-emit the same row. `maxItems` is a per-run
 * safety ceiling.
 */
export interface ListHarvestArgs {
  knownIds: string[];
  maxItems: number;
}

// Rich fields let the orchestrator skip the per-item `harvestUrl()`
// page load when the card DOM already carried enough metadata.
export interface ListEntry {
  sourceId: string;
  url: string;
  /** ISO timestamp the user actually saved this, when the source exposes it. */
  savedAt?: string;
  title?: string;
  description?: string;
  author?: string;
  mediaUrl?: string;
  mediaUrls?: Array<{ url: string; type?: MediaType; poster?: string }>;
  mediaType?: MediaType;
  meta?: Record<string, unknown>;
}

export type ListHarvestResult =
  | { ok: true; entries: ListEntry[]; reachedEnd: boolean }
  | { ok: false; reason: "auth_required" | "no_match" | "timeout" | "unknown" };

// Compile-time guard against silently dropping a new `Source` from
// sync; `article` has no list and stays unhandled by design.
export type ListSource = Exclude<Source, "article">;
