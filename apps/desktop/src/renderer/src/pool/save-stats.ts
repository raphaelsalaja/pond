import type { Capture, RawJson, RawYtdlp } from "@pond/schema/raw";
import { unixSecondsToIso, ytdlpDateToIso } from "@/lib/format";
import type { Save } from "./types";
import { pickAuthorAvatarUrl } from "./url";

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
  | "reactions"
  | "saves"
  | "replies"
  | "quotes"
  | "dislikes";

export interface SaveMetric {
  key: SaveMetricKey;
  label: string;
  value: number;
}

export interface SaveChapter {
  title: string;
  startSec: number;
}

export interface SaveStats {
  publishedAt?: string;
  durationSec?: number;
  language?: string;
  uploader?: { name?: string; url?: string; avatar?: string };
  channel?: { name?: string; url?: string };
  metrics: SaveMetric[];
  chapters?: SaveChapter[];
  music?: { title?: string; author?: string };
  location?: string;
  isPaidPartnership?: boolean;
  board?: { name?: string; url?: string };
  arenaChannels?: Array<{ title?: string; href?: string }>;
  cosmosClusters?: Array<{ id: string; title?: string }>;
  liveStatus?: string;
  musicVideo?: { track?: string; artist?: string; album?: string };
  extractor?: string;
  filesize?: number;
  videoSize?: { width: number; height: number; fps?: number };
}

export function extractSaveStats(save: Save): SaveStats {
  const raw = save.rawJson ?? null;
  const stats: SaveStats = { metrics: [] };

  if (raw?.capture) mergeCapture(stats, raw.capture);
  if (raw?.ytdlp) mergeYtdlp(stats, raw.ytdlp);

  if (save.author && !stats.uploader?.name) {
    stats.uploader = { ...stats.uploader, name: save.author };
  }

  const localAvatar = pickAuthorAvatarUrl(save);
  if (localAvatar) {
    stats.uploader = { ...stats.uploader, avatar: localAvatar };
  }

  return stats;
}

function mergeCapture(stats: SaveStats, capture: Capture): void {
  if (capture.publishedAt) stats.publishedAt = capture.publishedAt;
  if (capture.lang) stats.language = capture.lang;
  if (typeof capture.duration === "number") {
    stats.durationSec = capture.duration;
  }

  if (capture.author) {
    const name = capture.author.name ?? capture.author.handle;
    stats.uploader = {
      ...(name ? { name } : {}),
      ...(capture.author.profileUrl ? { url: capture.author.profileUrl } : {}),
      ...(capture.author.avatarUrl ? { avatar: capture.author.avatarUrl } : {}),
    };
  }

  const firstVideo = capture.media.find((m) => m.type === "video");
  if (firstVideo?.durationSec && stats.durationSec === undefined) {
    stats.durationSec = firstVideo.durationSec;
  }
  if (firstVideo?.width && firstVideo?.height) {
    stats.videoSize = { width: firstVideo.width, height: firstVideo.height };
  }

  if (capture.metrics) {
    pushMetric(stats, "views", "Views", capture.metrics.views);
    pushMetric(stats, "plays", "Plays", capture.metrics.plays);
    pushMetric(stats, "likes", "Likes", capture.metrics.likes);
    pushMetric(stats, "reactions", "Reactions", capture.metrics.reactions);
    pushMetric(stats, "comments", "Comments", capture.metrics.comments);
    pushMetric(stats, "replies", "Replies", capture.metrics.replies);
    pushMetric(stats, "reposts", "Reposts", capture.metrics.retweets);
    pushMetric(stats, "quotes", "Quotes", capture.metrics.quotes);
    pushMetric(stats, "shares", "Shares", capture.metrics.shares);
    pushMetric(stats, "bookmarks", "Bookmarks", capture.metrics.bookmarks);
    pushMetric(stats, "saves", "Saves", capture.metrics.saves);
    pushMetric(stats, "repins", "Repins", capture.metrics.repins);
    pushMetric(
      stats,
      "connections",
      "Connections",
      capture.metrics.connections,
    );
    pushMetric(stats, "downloads", "Downloads", capture.metrics.downloads);
  }

  const extras = capture.extras ?? {};

  // Pinterest board, Arena channels, Cosmos clusters all live under
  // `capture.extras` keyed by their source-specific names.
  const board = extras.board as { name?: string; url?: string } | undefined;
  if (board?.name || board?.url) {
    stats.board = { name: board.name, url: board.url };
  }

  const arenaChannels = extras.channels as
    | Array<{ title?: string; href?: string }>
    | undefined;
  if (Array.isArray(arenaChannels) && arenaChannels.length > 0) {
    stats.arenaChannels = arenaChannels.map((c) => ({
      title: c.title,
      href: c.href,
    }));
  }

  const cosmosClusters = extras.clusters as
    | Array<{ id?: string; title?: string }>
    | undefined;
  if (Array.isArray(cosmosClusters) && cosmosClusters.length > 0) {
    stats.cosmosClusters = cosmosClusters
      .filter((c): c is { id: string; title?: string } => Boolean(c.id))
      .map((c) => ({ id: c.id, title: c.title }));
  }
}

function mergeYtdlp(stats: SaveStats, ytdlp: RawYtdlp) {
  if (typeof ytdlp.duration === "number" && stats.durationSec === undefined) {
    stats.durationSec = ytdlp.duration;
  }

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

// Re-export for callers that want to type-narrow `save.rawJson`.
export type { RawJson };
