import type { MediaType } from "@pond/schema/db";
import { majorityMediaType } from "@pond/schema/media-type";
import type { RawJson } from "@pond/schema/raw";
import { walkCaptureMedia } from "@pond/schema/raw";
import { z } from "zod";
import {
  captureFromTweetDraft,
  draftFromRichPost,
} from "../capture/tweet-draft";
import type { RichPostDraft } from "../capture/tweet-draft";
import { pickTitle } from "../refresh/harvest/lib/title";
import type { BookmarksEntry, RichTweet } from "../refresh/harvest/twitter";

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

export function buildTwitterBookmarkSeed(
  entry: BookmarksEntry,
): SaveSeed | null {
  const rich = entry.rich;
  if (!rich) {
    return null;
  }

  const legacy = LegacyCreatedAtSchema.safeParse(rich.raw);
  const publishedAt = legacy.success
    ? toDate(legacy.data.legacy.created_at)
    : null;
  const author: RichPostDraft["author"] = {
    handle:
      rich.author.handle ||
      (entry.author ? entry.author.replace(/^@/, "") : ""),
    name: rich.author.name || rich.author.handle,
  };
  if (rich.author.avatarUrl) {
    author.avatarUrl = rich.author.avatarUrl;
  }

  const draft: RichPostDraft = {
    source: "twitter",
    id: entry.tweetId,
    url: entry.url,
    text: rich.fullText,
    author,
    media: rich.media,
    metrics: rich.metrics,
  };
  if (rich.quoted) {
    draft.quoted = richQuoted(rich.quoted);
  }
  if (rich.replyTo) {
    draft.isReply = true;
    if (rich.replyTo.handle) {
      draft.replyingTo = rich.replyTo.handle;
    }
    draft.replyTo = {
      source: "twitter",
      id: rich.replyTo.tweetId,
      url: rich.replyTo.url,
      text: "",
      author: {
        handle: rich.replyTo.handle,
        name: rich.replyTo.handle,
      },
      media: [],
    };
  }
  if (rich.card) {
    draft.card = rich.card;
  }
  if (publishedAt) {
    draft.publishedAt = publishedAt.toISOString();
  }

  const capture = captureFromTweetDraft(draftFromRichPost(draft));

  const handle = capture.author?.handle;
  const name = capture.author?.name;
  const media = walkCaptureMedia(capture);
  const title = capture.title ?? pickTitle(rich.fullText, entry.title);

  const rawJson: RawJson = {
    capture,
    extractorId: "twitter-bookmark-seed",
    extractedAt: new Date().toISOString(),
  };

  return {
    rawJson,
    title: title ?? null,
    description: capture.description ?? null,
    author: name ?? (handle ? `@${handle}` : (entry.author ?? null)),
    mediaUrl: capture.media[0]?.url ?? media[0]?.url ?? null,
    mediaType: majorityMediaType(
      capture.media.map((m) => (m.type === "video" ? "video" : "image")),
    ),
    publishedAt,
    lang: null,
  };
}

function richQuoted(quoted: RichTweet): RichPostDraft {
  const author: RichPostDraft["author"] = {
    handle: quoted.author.handle,
    name: quoted.author.name,
  };
  if (quoted.author.avatarUrl) {
    author.avatarUrl = quoted.author.avatarUrl;
  }

  const draft: RichPostDraft = {
    source: "twitter",
    id: quoted.tweetId,
    url: quoted.url,
    text: quoted.fullText,
    author,
    media: quoted.media,
    metrics: quoted.metrics,
  };
  if (quoted.quoted) {
    draft.quoted = richQuoted(quoted.quoted);
  }
  if (quoted.card) {
    draft.card = quoted.card;
  }
  return draft;
}

const LegacyCreatedAtSchema = z.object({
  legacy: z.object({ created_at: z.string() }),
});

function toDate(value: string): Date | null {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms) : null;
}
