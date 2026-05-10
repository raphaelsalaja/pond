import { saves } from "@pond/schema/db";
import type {
  RawSaveMetadata,
  RawTwitter,
  TwitterMediaItem,
} from "@pond/schema/raw";
import { eq } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";

/**
 * One-shot migration for Twitter saves imported before the
 * `buildRawForBookmark()` reshape landed in `sync/index.ts`.
 *
 * Older bookmarks were ingested with `raw.twitter` set to the verbatim
 * Twitter API tweet (`{ legacy: { favorite_count, … }, core: { … }, … }`)
 * and the parsed engagement counts at `raw.metrics`. The renderer's
 * `mergeTwitter` reads `raw.twitter.metrics.likes` etc., so every
 * metric chip silently disappeared on those rows.
 *
 * This module walks every twitter save, detects the legacy shape
 * (heuristic: `raw.twitter.legacy.favorite_count` exists OR
 * `raw.metrics` exists at the top level), and rewrites the row in
 * place to the canonical `RawTwitter` shape. Idempotent — once a row
 * has `raw.twitter.metrics` and no `raw.twitter.legacy`, it's skipped.
 *
 * Cheap to run on every startup (single SELECT against twitter rows
 * + per-row UPDATE only for the dirty ones), but we still gate it
 * behind a single in-process flag so duplicate startup work doesn't
 * re-scan the same rows when a developer hot-reloads main.
 */

let didRun = false;

interface VerbatimTweetLegacy {
  favorite_count?: number;
  retweet_count?: number;
  reply_count?: number;
  quote_count?: number;
  bookmark_count?: number;
  extended_entities?: { media?: VerbatimMedia[] };
  entities?: { media?: VerbatimMedia[] };
}

interface VerbatimMedia {
  media_url_https?: string;
  type?: "photo" | "video" | "animated_gif";
  video_info?: { variants?: Array<{ bitrate?: number; url?: string }> };
}

interface VerbatimTweet {
  legacy?: VerbatimTweetLegacy;
  views?: { count?: string };
  core?: {
    user_results?: {
      result?: {
        core?: { screen_name?: string; name?: string };
        legacy?: { screen_name?: string; name?: string };
      };
    };
  };
}

interface LegacyRawShape extends RawSaveMetadata {
  twitter?: RawTwitter & VerbatimTweet;
  metrics?: {
    likes?: number;
    retweets?: number;
    replies?: number;
    quotes?: number;
    bookmarks?: number;
    views?: number;
  };
}

export async function migrateTwitterRawShape(): Promise<void> {
  if (didRun) return;
  didRun = true;

  const db = await getDb();
  const rows = await db
    .select({ id: saves.id, rawJson: saves.rawJson })
    .from(saves)
    .where(eq(saves.source, "twitter"));

  let migrated = 0;
  for (const row of rows) {
    const raw = row.rawJson as LegacyRawShape | null;
    const reshaped = reshape(raw);
    if (!reshaped) continue;
    await db
      .update(saves)
      .set({ rawJson: reshaped })
      .where(eq(saves.id, row.id));
    migrated += 1;
  }

  if (migrated > 0) {
    log.info(
      `[pond migrate:twitter-raw] reshaped ${migrated}/${rows.length} rows`,
    );
  }
}

function reshape(raw: LegacyRawShape | null): RawSaveMetadata | null {
  if (!raw) return null;
  const tw = raw.twitter ?? {};
  const hasVerbatimLegacy =
    !!tw.legacy &&
    typeof tw.legacy === "object" &&
    Object.keys(tw.legacy).length > 0;
  const hasTopLevelMetrics = !!raw.metrics;
  const alreadyCanonical = !!tw.metrics && !tw.legacy;
  if (alreadyCanonical) return null;
  if (!hasVerbatimLegacy && !hasTopLevelMetrics) return null;

  const next: RawTwitter = {};
  // Preserve any fields already present on the legacy `raw.twitter`
  // that happen to be canonical (`bookmarkedAt`, `authorAvatar`, etc.)
  if (tw.bookmarkedAt) next.bookmarkedAt = tw.bookmarkedAt;
  if (tw.authorAvatar) next.authorAvatar = tw.authorAvatar;
  if (tw.publishedAt) next.publishedAt = tw.publishedAt;
  if (tw.lang) next.lang = tw.lang;

  const userCore = tw.core?.user_results?.result?.core;
  const userLegacy = tw.core?.user_results?.result?.legacy;
  const handle = userCore?.screen_name ?? userLegacy?.screen_name;
  const name = userCore?.name ?? userLegacy?.name;
  if (name && !next.authorName) next.authorName = name;
  if (handle && !next.authorUrl) next.authorUrl = `https://x.com/${handle}`;

  const legacy = tw.legacy ?? {};
  const viewsRaw = tw.views?.count;
  const viewsParsed = viewsRaw
    ? Number.parseInt(viewsRaw, 10) || undefined
    : undefined;

  const metricsFromVerbatim = {
    likes: legacy.favorite_count,
    retweets: legacy.retweet_count,
    replies: legacy.reply_count,
    bookmarks: legacy.bookmark_count,
    views: viewsParsed,
  };
  const topLevel = raw.metrics ?? {};

  next.metrics = {
    likes: metricsFromVerbatim.likes ?? topLevel.likes,
    retweets: metricsFromVerbatim.retweets ?? topLevel.retweets,
    replies: metricsFromVerbatim.replies ?? topLevel.replies,
    bookmarks: metricsFromVerbatim.bookmarks ?? topLevel.bookmarks,
    views: metricsFromVerbatim.views ?? topLevel.views,
  };

  const mediaList = legacy.extended_entities?.media ?? legacy.entities?.media;
  if (mediaList && mediaList.length > 0) {
    const media: TwitterMediaItem[] = [];
    for (const m of mediaList) {
      if (!m.media_url_https) continue;
      const type: TwitterMediaItem["type"] =
        m.type === "video" || m.type === "animated_gif" ? "video" : "image";
      const item: TwitterMediaItem = { url: m.media_url_https, type };
      if (type === "video") {
        const best = pickBestVariant(m.video_info?.variants);
        if (best) item.url = best;
        item.poster = m.media_url_https;
      }
      media.push(item);
    }
    if (media.length > 0) next.media = media;
  }

  // Rebuild the bag: keep every other source's data + scalars,
  // overwrite `twitter`, and drop the misplaced top-level `metrics`.
  const { metrics: _drop, twitter: _alsoDrop, ...rest } = raw;
  return {
    ...(rest as RawSaveMetadata),
    twitter: next,
    __verbatim: tw.legacy
      ? { legacy: tw.legacy, core: tw.core, views: tw.views }
      : undefined,
  };
}

function pickBestVariant(
  variants: Array<{ bitrate?: number; url?: string }> | undefined,
): string | null {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  let best: { bitrate?: number; url?: string } | null = null;
  for (const v of variants) {
    if (!v.url) continue;
    if (!best || (v.bitrate ?? 0) > (best.bitrate ?? 0)) best = v;
  }
  return best?.url ?? null;
}
