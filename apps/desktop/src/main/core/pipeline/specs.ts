import { OPS, type Op, type Save, type Source } from "@pond/schema/db";

export type { Op };

export const UNIVERSAL_SPEC: readonly Op[] = OPS;

// Per-op attempt budget. Tuned against each worker's wall-clock cost
// and recoverability. yt-dlp downloads are the most expensive (10-min
// watchdog) and the least likely to recover on retry — videos that
// errored once usually error every time. Avatar fetches are cheap but
// likely to be served from a CDN that's either available or it isn't.
// Anything pool-bound (harvest, capture, finalize) keeps the historical
// 5-attempt budget because flaky scrapes do often clear on the next
// run.
const MAX_ATTEMPTS: Record<Op, number> = {
  harvest_metadata: 5,
  capture_tweet: 4,
  fetch_blobs: 5,
  fetch_video_ytdlp: 3,
  ensure_poster: 4,
  fetch_avatar: 3,
  finalize: 5,
};

export function maxAttemptsFor(op: Op): number {
  return MAX_ATTEMPTS[op];
}

export function planOps(source: Source): readonly Op[] {
  // capture_tweet only runs for text-only X posts — for every other source
  // it would lease a hidden window, navigate to a non-tweet URL, and
  // produce nothing. Filter the op out of the spec for them so we don't
  // create dead tasks at enqueue time.
  if (source === "twitter") return UNIVERSAL_SPEC;
  return UNIVERSAL_SPEC.filter((op) => op !== "capture_tweet");
}

export interface CaptureExpectation {
  required: readonly string[];
  recommended: readonly string[];
}

export const CAPTURE_EXPECTATIONS: Record<Source, CaptureExpectation> = {
  twitter: {
    required: ["author"],
    recommended: [
      "title",
      "capture.publishedAt",
      "capture.metrics.likes",
      "capture.metrics.retweets",
      "capture.metrics.replies",
      "capture.author.avatarUrl",
    ],
  },
  instagram: {
    required: ["author", "capture.publishedAt"],
    recommended: [
      "capture.metrics.likes",
      "capture.metrics.comments",
      "capture.author.avatarUrl",
    ],
  },
  tiktok: {
    required: ["author", "capture.duration"],
    recommended: [
      "capture.metrics.likes",
      "capture.metrics.comments",
      "capture.metrics.shares",
      "capture.metrics.views",
      "capture.author.avatarUrl",
    ],
  },
  youtube: {
    required: ["title", "author", "capture.duration"],
    recommended: [
      "capture.metrics.views",
      "capture.metrics.likes",
      "capture.publishedAt",
      "capture.author.avatarUrl",
    ],
  },
  pinterest: {
    required: ["mediaUrl"],
    recommended: ["capture.author.handle", "capture.author.avatarUrl"],
  },
  arena: {
    required: ["capture.id"],
    recommended: [
      "capture.author.name",
      "capture.publishedAt",
      "capture.metrics.comments",
    ],
  },
  cosmos: {
    required: ["author"],
    recommended: [
      "capture.media",
      "capture.upstream.url",
      "capture.author.avatarUrl",
    ],
  },
};

// resolveYtDlpTarget — Capture.upstream is populated by the extractor when the
// save wraps content hosted elsewhere (Arena embed of YouTube, Cosmos tile of
// Vimeo). yt-dlp's existing extractor list handles those hosts directly so we
// just hand it the upstream URL. Pinterest pin URLs aren't yt-dlp-able on
// their own (no extractor); when a pin has a video, fetch_blobs grabs the
// direct .mp4 from Pinterest's CDN before this worker runs.
export function resolveYtDlpTarget(save: Save): string | null {
  const raw = save.rawJson as {
    capture?: { upstream?: { url?: string } };
  } | null;
  const upstreamUrl = raw?.capture?.upstream?.url;
  if (typeof upstreamUrl === "string" && upstreamUrl.length > 0) {
    return upstreamUrl;
  }
  if (save.source === "pinterest") return null;
  return save.url;
}
