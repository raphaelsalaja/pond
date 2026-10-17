import type { ListKind, MediaType } from "@pond/schema/db";

export interface ListHarvestArgs {
  knownIds: string[];
  earlyStop?: boolean;
  /** Page cursor an unfinished backfill stopped at. */
  resumeCursor?: string;
  /** Lists a walk that covers saved and liked items reads; omitted reads both. */
  listKinds?: ListKind[];
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
  listKinds?: ListKind[];
  /** Import collections the entry was found in, so sync can file it into matching Folders. */
  collectionIds?: string[];
}

export type ListHarvestResult =
  | {
      ok: true;
      entries: ListEntry[];
      reachedEnd: boolean;
      seen?: number;
      resumeCursor?: string;
    }
  | {
      ok: false;
      reason:
        | "auth_required"
        | "no_match"
        | "timeout"
        | "unknown"
        | "rate_limited"
        | "page_error";
      retryAfterSec?: number;
      error?: string;
    };
