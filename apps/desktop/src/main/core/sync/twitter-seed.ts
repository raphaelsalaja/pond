import type { MediaType } from "@pond/schema/db";
import { majorityMediaType } from "@pond/schema/media-type";
import type { RawJson } from "@pond/schema/raw";
import { walkCaptureMedia } from "@pond/schema/raw";
import {
  captureFromTweetDraft,
  draftFromRichPost,
} from "../capture/tweet-draft";
import type { RichPostDraft } from "../capture/tweet-draft";
import { pickTitle } from "../refresh/harvest/lib/title";
import {
  type BookmarksEntry,
  draftFromRichTweet,
} from "../refresh/harvest/twitter";

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

  const draft: RichPostDraft = {
    ...draftFromRichTweet(rich, entry.author?.replace(/^@/, "")),
    id: entry.tweetId,
    url: entry.url,
  };
  const publishedAt = draft.publishedAt ? new Date(draft.publishedAt) : null;

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
