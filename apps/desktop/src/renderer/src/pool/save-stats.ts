import type {
  RawArena,
  RawArticle,
  RawCosmos,
  RawInstagram,
  RawPinterest,
  RawSaveMetadata,
  RawTikTok,
  RawTwitter,
  RawYoutube,
  RawYtdlp,
} from "@pond/schema/raw";
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
  | "saves"
  | "replies"
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
    case "article":
      mergeArticle(stats, raw?.article);
      break;
  }

  const ytdlp = pickYtdlp(raw, save.source);
  if (ytdlp) mergeYtdlp(stats, ytdlp);

  if (save.author && !stats.uploader?.name) {
    stats.uploader = { ...stats.uploader, name: save.author };
  }

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
    // Pinterest's heart-icon count is `totalReactionCount`, surfaced here as
    // `reactions`; render it as "Likes" since that's what the UI shows.
    pushMetric(stats, "likes", "Likes", raw.metrics.reactions);
    pushMetric(stats, "saves", "Saves", raw.metrics.saves);
    pushMetric(stats, "comments", "Comments", raw.metrics.comments);
    pushMetric(stats, "repins", "Repins", raw.metrics.repins);
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
