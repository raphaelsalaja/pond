import type { MediaType, Source } from "@pond/schema/db";

export interface ListHarvestArgs {
  knownIds: string[];
}

// What list harvesters emit per saved item. The sync path only consumes
// `url` (to enqueue into the URL-first pipeline) and `sourceId` (to
// dedupe against already-imported saves) — the rest is kept around for
// the in-flight progress UI / future use, but no source-specific blob
// rides along, because the per-URL pipeline rebuilds the full `Capture`
// from scratch.
export interface ListEntry {
  sourceId: string;
  url: string;
  savedAt?: string;
  title?: string;
  description?: string;
  author?: string;
  mediaUrl?: string;
  mediaUrls?: Array<{ url: string; type?: MediaType; poster?: string }>;
  mediaType?: MediaType;
}

export type ListHarvestResult =
  | { ok: true; entries: ListEntry[]; reachedEnd: boolean }
  | { ok: false; reason: "auth_required" | "no_match" | "timeout" | "unknown" };

export type ListSource = Source;
