import { type SQL, sql } from "drizzle-orm";
import { saves } from "../db";
import type { FieldId } from "./types";

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

export function tagsExists(needle: SQL): SQL {
  return sql`exists (
    select 1 from json_each(${saves.tags}) where ${needle}
    union all
    select 1 from json_each(${saves.aiTags}) where ${needle}
  )`;
}

export function tagsDistinctCount(needle: SQL): SQL {
  return sql`(
    select count(distinct lower(value)) from (
      select value from json_each(${saves.tags})
      union all
      select value from json_each(${saves.aiTags})
    ) where ${needle}
  )`;
}

export function colorNear(hex: string, distance: number): SQL {
  return sql`exists (
    select 1 from json_each(${saves.dominantColors})
    where color_distance(
      json_extract(value, '$.hex'),
      ${hex}
    ) <= ${distance}
  )`;
}

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
    cast(json_extract(${saves.rawJson}, '$.article.ytdlp.duration') as real)
  )`;
}
