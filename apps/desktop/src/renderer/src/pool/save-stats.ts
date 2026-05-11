import type {
  RawArena,
  RawArticle,
  RawCosmos,
  RawInstagram,
  RawPinterest,
  RawReddit,
  RawSaveMetadata,
  RawTikTok,
  RawTwitter,
  RawYoutube,
  RawYtdlp,
} from "@pond/schema/raw";
import { unixSecondsToIso, ytdlpDateToIso } from "@/lib/format";
import type { Save } from "./types";
import { pickAuthorAvatarUrl } from "./url";

/**
 * Source-agnostic, display-ready snapshot of every metric / metadata
 * scrap we know about a single save. Built by `extractSaveStats(save)`
 * from the typed `raw.<source>` blob plus the yt-dlp sidecar.
 *
 * The `<SaveStats>` component renders this without any further
 * branching on `save.source` — the per-source mapping happens here so
 * that the JSX stays declarative.
 *
 * Every field is optional; the component hides any chip / row whose
 * value is missing.
 */

export type SaveMetricKey =
  | "views"
  | "likes"
  | "comments"
  | "shares"
  | "reposts"
  | "plays"
  | "bookmarks"
  | "downloads"
  | "connections"
  | "repins"
  | "replies"
  | "upvotes"
  | "awards"
  | "dislikes";

export interface SaveMetric {
  key: SaveMetricKey;
  label: string;
  value: number;
}

/** One YouTube chapter or yt-dlp `chapters[]` entry. */
export interface SaveChapter {
  title: string;
  startSec: number;
}

export interface SaveStats {
  /** ISO timestamp the post / video was authored. */
  publishedAt?: string;
  /** Video duration in seconds, when known. */
  durationSec?: number;
  /** BCP-47 language tag for the post body, when known. */
  language?: string;

  /** Author / uploader (used as the canonical attribution). */
  uploader?: { name?: string; url?: string; avatar?: string };
  /** YouTube-specific channel info — falls back to `uploader` on other sources. */
  channel?: { name?: string; url?: string };

  /** Stable-ordered metric chips. Ordering is canonical per source. */
  metrics: SaveMetric[];

  /** YouTube + yt-dlp chapters, normalised to `{ title, startSec }`. */
  chapters?: SaveChapter[];

  /** TikTok music attribution. */
  music?: { title?: string; author?: string };

  /** Instagram location tag. */
  location?: string;
  /** Instagram paid-partnership badge. */
  isPaidPartnership?: boolean;

  /** Pinterest board the pin lives on. */
  board?: { name?: string; url?: string };
  /** Are.na channels the block sits in. */
  arenaChannels?: Array<{ title?: string; href?: string }>;
  /** Cosmos clusters the element belongs to. */
  cosmosClusters?: Array<{ id: string; title?: string }>;

  /** Reddit subreddit. */
  subreddit?: string;

  /** yt-dlp live state (`is_live`, `was_live`, `post_live`). */
  liveStatus?: string;
  /** yt-dlp track/artist/album for music videos. */
  musicVideo?: { track?: string; artist?: string; album?: string };
  /** Pretty extractor name for diagnostic UIs. */
  extractor?: string;

  /** Total upload size in bytes (when yt-dlp reports it). */
  filesize?: number;
  /** Display dimensions reported by yt-dlp. */
  videoSize?: { width: number; height: number; fps?: number };
}

/**
 * Build a normalised `SaveStats` from a `Save`. Pure — safe to call
 * during render; just a few field reads + array builds.
 */
export function extractSaveStats(save: Save): SaveStats {
  const raw = (save.rawJson ?? null) as RawSaveMetadata | null;
  const stats: SaveStats = { metrics: [] };

  switch (save.source) {
    case "twitter":
      mergeTwitter(stats, raw?.twitter);
      break;
    case "instagram":
      mergeInstagram(stats, raw?.instagram);
      break;
    case "pinterest":
      mergePinterest(stats, raw?.pinterest);
      break;
    case "arena":
      mergeArena(stats, raw?.arena);
      break;
    case "cosmos":
      mergeCosmos(stats, raw?.cosmos);
      break;
    case "tiktok":
      mergeTikTok(stats, raw?.tiktok);
      break;
    case "youtube":
      mergeYoutube(stats, raw?.youtube);
      break;
    case "reddit":
      mergeReddit(stats, raw?.reddit);
      break;
    case "article":
      mergeArticle(stats, raw?.article);
      break;
  }

  // yt-dlp lives under `raw.<source>.ytdlp` regardless of source — pull
  // it from whichever bag is populated and fold its scalars into the
  // accumulator. For sources we never get yt-dlp on (Pinterest, Are.na
  // most pins) the lookup just returns undefined and nothing changes.
  const ytdlp = pickYtdlp(raw, save.source);
  if (ytdlp) mergeYtdlp(stats, ytdlp);

  if (save.author && !stats.uploader?.name) {
    stats.uploader = { ...stats.uploader, name: save.author };
  }

  // Local-first avatar override. The per-source mergers above always
  // assign the remote `raw.<source>.authorAvatar` URL, but we'd rather
  // serve the cached `pond://<id>/avatar.<ext>` whenever the ingest
  // pipeline managed to pull the bytes onto disk — see `pickAuthorAvatarUrl`
  // for the rationale.
  const localAvatar = pickAuthorAvatarUrl(save);
  if (localAvatar) {
    stats.uploader = { ...stats.uploader, avatar: localAvatar };
  }

  return stats;
}

function mergeTwitter(stats: SaveStats, raw: RawTwitter | undefined) {
  if (!raw) return;
  stats.publishedAt ??= raw.publishedAt;
  stats.language ??= raw.lang;
  stats.uploader = {
    ...stats.uploader,
    name: raw.authorName ?? stats.uploader?.name,
    url: raw.authorUrl ?? stats.uploader?.url,
    avatar: raw.authorAvatar ?? stats.uploader?.avatar,
  };
  if (raw.metrics) {
    pushMetric(stats, "views", "Views", raw.metrics.views);
    pushMetric(stats, "likes", "Likes", raw.metrics.likes);
    pushMetric(stats, "reposts", "Reposts", raw.metrics.retweets);
    pushMetric(stats, "replies", "Replies", raw.metrics.replies);
    pushMetric(stats, "bookmarks", "Bookmarks", raw.metrics.bookmarks);
  }
  // First media item carries video duration on tweets that contain a
  // single clip; ignore the per-item array beyond that for now.
  const firstVideo = raw.media?.find((m) => m.type === "video");
  if (firstVideo?.durationSec) stats.durationSec ??= firstVideo.durationSec;
}

function mergeInstagram(stats: SaveStats, raw: RawInstagram | undefined) {
  if (!raw) return;
  stats.publishedAt ??= raw.publishedAt;
  stats.language ??= raw.lang;
  stats.location ??= raw.location;
  stats.isPaidPartnership ??= raw.isPaidPartnership;
  stats.uploader = {
    ...stats.uploader,
    name: raw.authorName ?? stats.uploader?.name,
    url: raw.authorUrl ?? stats.uploader?.url,
    avatar: raw.authorAvatar ?? stats.uploader?.avatar,
  };
  if (raw.metrics) {
    pushMetric(stats, "plays", "Plays", raw.metrics.plays);
    pushMetric(stats, "likes", "Likes", raw.metrics.likes);
    pushMetric(stats, "comments", "Comments", raw.metrics.comments);
  }
  const firstVideo = raw.media?.find((m) => m.type === "video");
  if (firstVideo?.durationSec) stats.durationSec ??= firstVideo.durationSec;
}

function mergePinterest(stats: SaveStats, raw: RawPinterest | undefined) {
  if (!raw) return;
  stats.publishedAt ??= raw.publishedAt;
  stats.uploader = {
    ...stats.uploader,
    name: raw.authorName ?? stats.uploader?.name,
    url: raw.authorUrl ?? stats.uploader?.url,
    avatar: raw.authorAvatar ?? stats.uploader?.avatar,
  };
  if (raw.metrics) {
    pushMetric(stats, "repins", "Repins", raw.metrics.repins);
    pushMetric(stats, "comments", "Comments", raw.metrics.comments);
  }
  if (raw.board?.name || raw.board?.url) {
    stats.board = { name: raw.board.name, url: raw.board.url };
  }
}

function mergeArena(stats: SaveStats, raw: RawArena | undefined) {
  if (!raw) return;
  stats.publishedAt ??= raw.publishedAt;
  stats.uploader = {
    ...stats.uploader,
    name: raw.authorName ?? stats.uploader?.name,
    url: raw.authorUrl ?? stats.uploader?.url,
    avatar: raw.authorAvatar ?? stats.uploader?.avatar,
  };
  if (raw.metrics) {
    pushMetric(stats, "connections", "Connections", raw.metrics.connections);
    pushMetric(stats, "comments", "Comments", raw.metrics.comments);
  }
  if (raw.channels?.length) {
    stats.arenaChannels = raw.channels
      .filter((c): c is { title?: string; href?: string } => Boolean(c))
      .map((c) => ({ title: c.title, href: c.href }));
  }
}

function mergeCosmos(stats: SaveStats, raw: RawCosmos | undefined) {
  if (!raw) return;
  stats.publishedAt ??= raw.publishedAt;
  stats.uploader = {
    ...stats.uploader,
    name: raw.authorName ?? stats.uploader?.name,
    url: raw.authorUrl ?? stats.uploader?.url,
  };
  if (raw.clusters?.length) {
    stats.cosmosClusters = raw.clusters.map((c) => ({
      id: c.id,
      title: c.title,
    }));
  }
}

function mergeTikTok(stats: SaveStats, raw: RawTikTok | undefined) {
  if (!raw) return;
  stats.publishedAt ??= raw.publishedAt;
  stats.durationSec ??= raw.durationSec;
  stats.uploader = {
    ...stats.uploader,
    name: raw.authorName ?? raw.authorHandle ?? stats.uploader?.name,
    avatar: raw.authorAvatar ?? stats.uploader?.avatar,
  };
  if (raw.metrics) {
    pushMetric(stats, "plays", "Plays", raw.metrics.plays);
    pushMetric(stats, "likes", "Likes", raw.metrics.likes);
    pushMetric(stats, "comments", "Comments", raw.metrics.comments);
    pushMetric(stats, "shares", "Shares", raw.metrics.shares);
    pushMetric(stats, "downloads", "Downloads", raw.metrics.downloads);
  }
  if (raw.music?.title || raw.music?.author) {
    stats.music = { title: raw.music.title, author: raw.music.author };
  }
}

function mergeYoutube(stats: SaveStats, raw: RawYoutube | undefined) {
  if (!raw) return;
  stats.publishedAt ??= raw.publishedAt;
  stats.durationSec ??= raw.durationSec;
  if (raw.channelName || raw.channelUrl) {
    stats.channel = {
      name: raw.channelName,
      url: raw.channelUrl,
    };
    stats.uploader = {
      ...stats.uploader,
      name: raw.channelName ?? stats.uploader?.name,
      url: raw.channelUrl ?? stats.uploader?.url,
    };
  }
  if (raw.metrics) {
    pushMetric(stats, "views", "Views", raw.metrics.views);
    pushMetric(stats, "likes", "Likes", raw.metrics.likes);
  }
  if (raw.chapters?.length) {
    stats.chapters = raw.chapters.map((c) => ({
      title: c.title,
      startSec: c.startSec,
    }));
  }
}

function mergeReddit(stats: SaveStats, raw: RawReddit | undefined) {
  if (!raw) return;
  stats.publishedAt ??= raw.publishedAt;
  stats.subreddit ??= raw.subreddit;
  stats.uploader = {
    ...stats.uploader,
    name: raw.authorName ?? stats.uploader?.name,
    url: raw.authorUrl ?? stats.uploader?.url,
  };
  if (raw.metrics) {
    pushMetric(stats, "upvotes", "Upvotes", raw.metrics.upvotes);
    pushMetric(stats, "comments", "Comments", raw.metrics.comments);
    pushMetric(stats, "awards", "Awards", raw.metrics.awards);
  }
}

function mergeArticle(stats: SaveStats, raw: RawArticle | undefined) {
  if (!raw) return;
  stats.publishedAt ??= raw.publishedAt;
  stats.language ??= raw.lang;
}

function pickYtdlp(
  raw: RawSaveMetadata | null,
  source: string,
): RawYtdlp | undefined {
  if (!raw) return undefined;
  // Direct lookup first — covers every source we ship.
  const direct = (raw as Record<string, unknown>)[source];
  if (
    direct &&
    typeof direct === "object" &&
    "ytdlp" in direct &&
    direct.ytdlp &&
    typeof direct.ytdlp === "object"
  ) {
    return direct.ytdlp as RawYtdlp;
  }
  // Fallback: walk every per-source bag in case the source enum drifted
  // away from the raw key (e.g. legacy saves where the value was
  // written under a different key during a migration).
  for (const value of Object.values(raw)) {
    if (
      value &&
      typeof value === "object" &&
      "ytdlp" in value &&
      (value as { ytdlp?: unknown }).ytdlp
    ) {
      return (value as { ytdlp: RawYtdlp }).ytdlp;
    }
  }
  return undefined;
}

function mergeYtdlp(stats: SaveStats, ytdlp: RawYtdlp) {
  if (typeof ytdlp.duration === "number") {
    stats.durationSec ??= ytdlp.duration;
  }

  // Date — try the most precise source first, then the calendar date.
  if (!stats.publishedAt) {
    const fromTimestamp =
      unixSecondsToIso(ytdlp.release_timestamp) ??
      unixSecondsToIso(ytdlp.timestamp);
    stats.publishedAt =
      fromTimestamp ??
      ytdlpDateToIso(ytdlp.release_date) ??
      ytdlpDateToIso(ytdlp.upload_date) ??
      undefined;
  }

  if (ytdlp.language && !stats.language) stats.language = ytdlp.language;
  if (ytdlp.live_status) stats.liveStatus = ytdlp.live_status;
  if (ytdlp.extractor) stats.extractor = ytdlp.extractor;

  if (ytdlp.uploader || ytdlp.uploader_url) {
    stats.uploader = {
      ...stats.uploader,
      name: stats.uploader?.name ?? ytdlp.uploader,
      url: stats.uploader?.url ?? ytdlp.uploader_url,
    };
  }
  if (ytdlp.channel || ytdlp.channel_url) {
    stats.channel = {
      ...stats.channel,
      name: stats.channel?.name ?? ytdlp.channel,
      url: stats.channel?.url ?? ytdlp.channel_url,
    };
  }

  if (ytdlp.track || ytdlp.artist || ytdlp.album) {
    stats.musicVideo = {
      track: ytdlp.track,
      artist: ytdlp.artist,
      album: ytdlp.album,
    };
  }

  if (
    typeof ytdlp.width === "number" &&
    typeof ytdlp.height === "number" &&
    ytdlp.width > 0 &&
    ytdlp.height > 0
  ) {
    stats.videoSize = {
      width: ytdlp.width,
      height: ytdlp.height,
      fps: typeof ytdlp.fps === "number" ? ytdlp.fps : undefined,
    };
  }

  if (typeof ytdlp.filesize === "number") {
    stats.filesize = ytdlp.filesize;
  } else if (typeof ytdlp.filesize_approx === "number") {
    stats.filesize = ytdlp.filesize_approx;
  }

  // Metric fallbacks — only fire when the per-source mapper didn't
  // already record one. We don't double-count: a Twitter view count
  // already on `stats.metrics` skips the yt-dlp `view_count`.
  pushMetricIfMissing(stats, "views", "Views", ytdlp.view_count);
  pushMetricIfMissing(stats, "likes", "Likes", ytdlp.like_count);
  pushMetricIfMissing(stats, "comments", "Comments", ytdlp.comment_count);
  pushMetricIfMissing(stats, "reposts", "Reposts", ytdlp.repost_count);
  pushMetricIfMissing(stats, "dislikes", "Dislikes", ytdlp.dislike_count);

  if (!stats.chapters && ytdlp.chapters?.length) {
    const chapters: SaveChapter[] = [];
    for (const c of ytdlp.chapters) {
      if (typeof c.start_time !== "number" || !c.title) continue;
      chapters.push({ title: c.title, startSec: c.start_time });
    }
    if (chapters.length) stats.chapters = chapters;
  }
}

function pushMetric(
  stats: SaveStats,
  key: SaveMetricKey,
  label: string,
  value: number | undefined,
) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return;
  stats.metrics.push({ key, label, value });
}

function pushMetricIfMissing(
  stats: SaveStats,
  key: SaveMetricKey,
  label: string,
  value: number | undefined,
) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return;
  if (stats.metrics.some((m) => m.key === key)) return;
  stats.metrics.push({ key, label, value });
}
