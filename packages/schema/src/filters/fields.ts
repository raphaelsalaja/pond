/**
 * SQL projections for every filterable field.
 *
 * Main-only — imports Drizzle's `sql` template and the `saves` table
 * directly. The renderer doesn't need this; chip UI gets its
 * metadata from `./meta.ts` and ships ASTs to main over IPC.
 *
 * Each entry maps a `FieldId` to a SQL expression that returns the
 * projected scalar (or NULL if the projection isn't available).
 * Bespoke fields with JSON-array projections (`tags`, `color`)
 * carry a `custom` flag — `to-sql.ts` routes them to per-field
 * builders instead of treating them as scalar columns.
 */

import { type SQL, sql } from "drizzle-orm";
import { saves } from "../db";
import type { FieldId } from "./types";

/* ------------------------------------------------------------------ */
/* Scalar projections                                                 */
/* ------------------------------------------------------------------ */

/**
 * Scalar SQL expression per field. Used directly by the standard
 * comparators (eq, neq, in, lt, etc.) in `to-sql.ts`. JSON-array
 * fields are excluded from this map and routed through bespoke
 * handlers; trying to fold them into a scalar would hide the array
 * semantics behind ambiguous matches.
 */
export const SCALAR_PROJECTIONS: Partial<Record<FieldId, SQL>> = {
  source: sql`lower(${saves.source})`,
  type: sql`lower(coalesce(${saves.mediaType}, ${saves.source}))`,
  shape: sql`case
    when ${saves.width} is null or ${saves.height} is null
      or ${saves.width} = 0 or ${saves.height} = 0 then null
    when (cast(${saves.width} as real) / ${saves.height}) > 0.9
      and (cast(${saves.width} as real) / ${saves.height}) < 1.1 then 'square'
    when (cast(${saves.width} as real) / ${saves.height}) < 0.9 then 'portrait'
    else 'landscape'
  end`,
  size: sql`${saves.fileSize}`,
  dimensions: sql`max(${saves.width}, ${saves.height})`,
  duration: durationProjection(),
  creator: sql`lower(${saves.author})`,
  url: sql`lower(${saves.url})`,
  note: sql`nullif(
    trim(coalesce(${saves.notes}, ${saves.description}, '')),
    ''
  )`,
  savedAt: sql`${saves.savedAt}`,
  publishedAt: sql`${saves.publishedAt}`,
  modifiedAt: sql`coalesce(
    ${saves.embeddingUpdatedAt},
    ${saves.createdAt},
    ${saves.savedAt}
  )`,
};

/* ------------------------------------------------------------------ */
/* Tags — JSON array projection                                       */
/* ------------------------------------------------------------------ */

/**
 * `EXISTS (SELECT 1 FROM json_each(tags|ai_tags) WHERE …)` — used
 * by `some`/`none`. The column union covers user + AI tags.
 */
export function tagsExists(needle: SQL): SQL {
  return sql`exists (
    select 1 from json_each(${saves.tags}) where ${needle}
    union all
    select 1 from json_each(${saves.aiTags}) where ${needle}
  )`;
}

/**
 * `(SELECT COUNT(DISTINCT lower(value)) FROM tagsUnion WHERE
 * lower(value) IN (…)) = N` — used by `every` to check that every
 * needle is present in the merged tag set.
 */
export function tagsDistinctCount(needle: SQL): SQL {
  return sql`(
    select count(distinct lower(value)) from (
      select value from json_each(${saves.tags})
      union all
      select value from json_each(${saves.aiTags})
    ) where ${needle}
  )`;
}

/* ------------------------------------------------------------------ */
/* Color — JSON array of {hex, weight}                                */
/* ------------------------------------------------------------------ */

/**
 * `EXISTS (SELECT 1 FROM json_each(dominant_colors) WHERE
 * color_distance(json_extract(value, '$.hex'), ?) <= ?)`. Relies on
 * the `color_distance` SQLite scalar registered by
 * `./sqlite-fns.ts`.
 */
export function colorNear(hex: string, distance: number): SQL {
  return sql`exists (
    select 1 from json_each(${saves.dominantColors})
    where color_distance(
      json_extract(value, '$.hex'),
      ${hex}
    ) <= ${distance}
  )`;
}

/* ------------------------------------------------------------------ */
/* Duration — 13-arm fallback through raw_json                        */
/* ------------------------------------------------------------------ */

/**
 * Resolve the clip length (seconds) by walking the source-keyed
 * `rawJson` blobs. Mirrors `match.ts` `durationSeconds()` so JS
 * and SQL agree.
 *
 * Long term we should land a `saves.duration_sec` column populated
 * by the auto-video pipeline, drop this projection, and key the
 * `duration` filter off the column instead.
 */
function durationProjection(): SQL {
  return sql`coalesce(
    cast(json_extract(${saves.rawJson}, '$.youtube.durationSec') as real),
    cast(json_extract(${saves.rawJson}, '$.youtube.ytdlp.duration') as real),
    cast(json_extract(${saves.rawJson}, '$.tiktok.durationSec') as real),
    cast(json_extract(${saves.rawJson}, '$.tiktok.ytdlp.duration') as real),
    cast(json_extract(${saves.rawJson}, '$.twitter.ytdlp.duration') as real),
    cast(json_extract(${saves.rawJson}, '$.twitter.media[0].durationSec') as real),
    cast(json_extract(${saves.rawJson}, '$.instagram.ytdlp.duration') as real),
    cast(json_extract(${saves.rawJson}, '$.instagram.media[0].durationSec') as real),
    cast(json_extract(${saves.rawJson}, '$.pinterest.ytdlp.duration') as real),
    cast(json_extract(${saves.rawJson}, '$.arena.ytdlp.duration') as real),
    cast(json_extract(${saves.rawJson}, '$.cosmos.ytdlp.duration') as real),
    cast(json_extract(${saves.rawJson}, '$.reddit.ytdlp.duration') as real),
    cast(json_extract(${saves.rawJson}, '$.article.ytdlp.duration') as real)
  )`;
}
