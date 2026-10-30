import { OPS, type Op, type Save, type Source } from "@pond/schema/db";
import { type RawJson, walkCaptureMedia } from "@pond/schema/raw";

const UNIVERSAL_SPEC: readonly Op[] = OPS;

const MAX_ATTEMPTS = {
  harvest_metadata: 5,
  capture_tweet: 4,
  render_text_cover: 3,
  fetch_blobs: 5,
  archive_page: 3,
  fetch_video_ytdlp: 3,
  ensure_poster: 4,
  fetch_avatar: 3,
  finalize: 5,
} satisfies Record<Op, number>;

export function maxAttemptsFor(op: Op): number {
  return MAX_ATTEMPTS[op];
}

export function planOps(source: Source): readonly Op[] {
  if (source === "local") return [];
  if (source === "web") {
    return [
      "harvest_metadata",
      "render_text_cover",
      "fetch_blobs",
      "archive_page",
      "finalize",
    ];
  }
  if (source === "github") {
    return UNIVERSAL_SPEC.filter(
      (op) =>
        op !== "capture_tweet" &&
        op !== "archive_page" &&
        op !== "fetch_video_ytdlp",
    );
  }
  if (source === "twitter" || source === "threads") {
    return UNIVERSAL_SPEC.filter(
      (op) => op !== "archive_page" && op !== "render_text_cover",
    );
  }
  return UNIVERSAL_SPEC.filter(
    (op) => op !== "capture_tweet" && op !== "archive_page",
  );
}

export type CaptureField =
  | "author"
  | "description"
  | "mediaUrl"
  | "sourceId"
  | "title"
  | "capture.author.avatarUrl"
  | "capture.author.handle"
  | "capture.author.name"
  | "capture.duration"
  | "capture.id"
  | "capture.media"
  | "capture.metrics.comments"
  | "capture.metrics.likes"
  | "capture.metrics.replies"
  | "capture.metrics.retweets"
  | "capture.metrics.shares"
  | "capture.metrics.views"
  | "capture.publishedAt"
  | "capture.upstream.url";

interface CaptureExpectation {
  required: readonly CaptureField[];
  recommended: readonly CaptureField[];
}

export const CAPTURE_EXPECTATIONS = {
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
    required: ["sourceId"],
    recommended: [
      "mediaUrl",
      "description",
      "author",
      "capture.media",
      "capture.upstream.url",
      "capture.author.avatarUrl",
    ],
  },
  reddit: {
    required: ["title"],
    recommended: [
      "author",
      "mediaUrl",
      "capture.publishedAt",
      "capture.metrics.likes",
      "capture.metrics.comments",
    ],
  },
  threads: {
    required: ["author"],
    recommended: [
      "title",
      "capture.publishedAt",
      "capture.metrics.likes",
      "capture.metrics.replies",
      "capture.author.avatarUrl",
    ],
  },
  github: {
    required: ["title"],
    recommended: ["description", "author", "capture.author.avatarUrl"],
  },
  substack: {
    required: ["title"],
    recommended: ["description", "author", "capture.publishedAt"],
  },
  tumblr: {
    required: ["author"],
    recommended: ["description", "mediaUrl", "capture.publishedAt"],
  },
  savee: {
    required: ["mediaUrl"],
    recommended: ["title", "author", "capture.upstream.url"],
  },
  behance: {
    required: ["title"],
    recommended: ["mediaUrl", "author", "capture.publishedAt"],
  },
  vimeo: {
    required: ["title"],
    recommended: ["author", "capture.publishedAt", "capture.media"],
  },
  dribbble: {
    required: ["mediaUrl"],
    recommended: ["title", "author", "capture.metrics.likes"],
  },
  unsplash: {
    required: ["mediaUrl"],
    recommended: ["title", "author", "capture.publishedAt"],
  },
  bluesky: {
    required: ["author"],
    recommended: [
      "description",
      "capture.publishedAt",
      "capture.author.avatarUrl",
    ],
  },
  marked: {
    required: ["mediaUrl"],
    recommended: ["title", "author", "capture.upstream.url"],
  },
  web: {
    required: ["title"],
    recommended: ["description", "mediaUrl"],
  },
  local: { required: [], recommended: [] },
} satisfies Record<Source, CaptureExpectation>;

export function resolveYtDlpTarget(
  save: Pick<Save, "rawJson" | "source" | "url">,
): string | null {
  const upstreamUrl = save.rawJson?.capture?.upstream?.url;
  if (upstreamUrl) return upstreamUrl;
  if (save.source === "pinterest") return null;
  return save.url;
}

export function countCaptureVideos(rawJson: RawJson | null): number {
  return walkCaptureMedia(rawJson?.capture).filter((m) => m.type === "video")
    .length;
}

export function expectedVideoDownloads(
  save: Pick<Save, "mediaType" | "rawJson">,
): number {
  const fromCapture = countCaptureVideos(save.rawJson);
  if (fromCapture > 0) return fromCapture;
  return save.mediaType === "video" ? 1 : 0;
}
