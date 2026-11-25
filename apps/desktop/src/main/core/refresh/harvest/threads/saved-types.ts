import type { ListKind, MediaType } from "@pond/schema/db";
import type { RichThread, SavedCapture } from "./graphql";

export interface SavedHarvestArgs {
  knownIds: Array<string>;
}

export interface SavedEntry {
  postId: string;
  url: string;
  title?: string;
  description?: string;
  author?: string;
  mediaUrl?: string;
  mediaUrls?: Array<{
    url: string;
    type?: MediaType;
    poster?: string;
  }>;
  rich?: RichThread;
  listKinds?: Array<ListKind>;
}

export type SavedHarvestResult =
  | {
      ok: true;
      entries: Array<SavedEntry>;
      captures: Array<SavedCapture>;
      reachedEnd: boolean;
    }
  | {
      ok: false;
      reason: "auth_required" | "no_match" | "timeout" | "rate_limited";
      retryAfterSec?: number;
    };
