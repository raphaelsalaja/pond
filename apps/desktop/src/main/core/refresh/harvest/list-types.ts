import type { MediaType, Source } from "@pond/schema/db";

export interface ListHarvestArgs {
  knownIds: string[];
}

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
  meta?: Record<string, unknown>;
}

export type ListHarvestResult =
  | { ok: true; entries: ListEntry[]; reachedEnd: boolean }
  | { ok: false; reason: "auth_required" | "no_match" | "timeout" | "unknown" };

export type ListSource = Exclude<Source, "article">;
