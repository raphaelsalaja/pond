import { sql } from "drizzle-orm";
import type { SQL, SQLWrapper } from "drizzle-orm";
import { saves } from "../../db";

export function jsonArrayExists(column: SQLWrapper, needle: SQL): SQL {
  return sql`exists (
    select 1 from json_each(${column}) where ${needle}
  )`;
}

export function jsonArrayEmpty(column: SQLWrapper): SQL {
  return sql`not exists (
    select 1 from json_each(${column})
  )`;
}

export function jsonArrayDistinctCount(column: SQLWrapper, needle: SQL): SQL {
  return sql`(
    select count(distinct lower(value)) from json_each(${column})
    where ${needle}
  )`;
}

export function folderExists(folderIds: Array<string>): SQL {
  if (folderIds.length === 0) {
    return sql`not exists (select 1 from save_folders where save_id = ${saves.id})`;
  }
  const inList = sql.join(
    folderIds.map((id) => sql`${id}`),
    sql`, `,
  );
  return sql`exists (
    select 1 from save_folders
    where save_id = ${saves.id} and folder_id in (${inList})
  )`;
}

export function tagsExists(needle: SQL): SQL {
  return jsonArrayExists(saves.tags, needle);
}

export function tagsEmpty(): SQL {
  return jsonArrayEmpty(saves.tags);
}

export function tagsDistinctCount(needle: SQL): SQL {
  return jsonArrayDistinctCount(saves.tags, needle);
}

export function durationProjection(): SQL {
  return sql`coalesce(
    cast(json_extract(${saves.rawJson}, '$.capture.duration') as real),
    (
      select cast(json_extract(value, '$.durationSec') as real)
      from json_each(json_extract(${saves.rawJson}, '$.capture.media'))
      where cast(json_extract(value, '$.durationSec') as real) > 0
      limit 1
    ),
    cast(json_extract(${saves.rawJson}, '$.ytdlp.duration') as real),
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
    cast(json_extract(${saves.rawJson}, '$.cosmos.ytdlp.duration') as real)
  )`;
}
