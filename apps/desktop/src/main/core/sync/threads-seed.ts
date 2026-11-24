import type { MediaType } from "@pond/schema/db";
import { majorityMediaType } from "@pond/schema/media-type";
import type { RawJson } from "@pond/schema/raw";
import {
  captureFromTweetDraft,
  draftFromRichPost,
} from "../capture/tweet-draft";
import type { RichPostDraft } from "../capture/tweet-draft";
import type { RichThread } from "../refresh/harvest/threads/graphql";
import type { SavedEntry } from "../refresh/harvest/threads/saved-types";

interface SaveSeed {
  rawJson: RawJson;
  title?: string | null;
  description?: string | null;
  author?: string | null;
  mediaUrl?: string | null;
  mediaType?: MediaType | null;
  publishedAt?: Date | null;
  lang?: string | null;
}

export function buildThreadsSavedSeed(entry: SavedEntry): SaveSeed | null {
  const rich = entry.rich;
  if (!rich) {
    return null;
  }

  const publishedAt = rich.publishedAt ? new Date(rich.publishedAt) : null;
  const capture = captureFromTweetDraft(draftFromRichPost(richPost(rich)));

  const handle = capture.author?.handle;
  const name = capture.author?.name;

  const rawJson: RawJson = {
    capture,
    extractorId: "threads-saved-seed",
    extractedAt: new Date().toISOString(),
  };

  return {
    rawJson,
    title: capture.title ?? null,
    description: capture.description ?? null,
    author: name ?? (handle ? `@${handle}` : (entry.author ?? null)),
    mediaUrl: capture.media[0]?.url ?? null,
    mediaType: majorityMediaType(
      capture.media.map((m) => (m.type === "video" ? "video" : "image")),
    ),
    publishedAt:
      publishedAt && Number.isFinite(publishedAt.getTime())
        ? publishedAt
        : null,
    lang: null,
  };
}

function richPost(rich: RichThread): RichPostDraft {
  const author: RichPostDraft["author"] = {
    handle: rich.author.handle,
    name: rich.author.name,
  };
  if (rich.author.avatarUrl) {
    author.avatarUrl = rich.author.avatarUrl;
  }
  if (rich.author.verified) {
    author.verified = true;
  }

  const draft: RichPostDraft = {
    source: "threads",
    id: rich.postId,
    url: rich.url,
    text: rich.fullText,
    author,
    media: rich.media,
    metrics: rich.metrics,
  };
  if (rich.quoted) {
    draft.quoted = richPost(rich.quoted);
  }
  if (rich.card) {
    draft.card = rich.card;
  }
  if (rich.isReply) {
    draft.isReply = true;
  }
  if (rich.replyingTo) {
    draft.replyingTo = rich.replyingTo;
  }
  if (rich.publishedAt) {
    draft.publishedAt = rich.publishedAt;
  }
  return draft;
}
