import { saves } from "@pond/schema/db";
import { EMPTY_QUERY } from "@pond/schema/filters";
import { splitPostSourceIdSql } from "@pond/schema/filters/fields";
import { and, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { SplitPostSummary } from "../../shared/split-posts";
import type { Db } from "../db";
import { libraryQueryWhere, librarySortColumn } from "./library-query";

const MemberRowSchema = z.object({
  id: z.string(),
  source: z.string(),
  post: z.string(),
  title: z.string().nullable(),
  savedAt: z.number(),
});
const CountRowSchema = z.object({ n: z.number() });

function splitMembersWhere(hiddenFolderIds: readonly string[]) {
  return and(
    libraryQueryWhere({ query: EMPTY_QUERY }, hiddenFolderIds),
    isNotNull(splitPostSourceIdSql()),
  );
}

/** A post with one live Save left is no longer a gallery, so it drops out of Split Posts. */
export function querySplitPosts(
  db: Db,
  hiddenFolderIds: readonly string[] = [],
): SplitPostSummary[] {
  const rows = z.array(MemberRowSchema).parse(
    db.all(
      sql`select ${saves.id} as id, ${saves.source} as source, ${splitPostSourceIdSql()} as post,
        ${saves.title} as title, ${saves.savedAt} as savedAt
        from ${saves}
        where ${splitMembersWhere(hiddenFolderIds)}
        order by source, post, ${librarySortColumn("post")}, ${saves.id} desc`,
    ),
  );
  const posts = new Map<string, SplitPostSummary>();
  for (const row of rows) {
    const key = `${row.source}:${row.post}`;
    const post = posts.get(key);
    if (!post) {
      posts.set(key, {
        key,
        source: row.source,
        title: row.title,
        saveIds: [row.id],
        savedAt: row.savedAt,
      });
      continue;
    }
    post.saveIds.push(row.id);
    post.title ??= row.title;
    post.savedAt = Math.max(post.savedAt, row.savedAt);
  }
  return [...posts.values()]
    .filter((post) => post.saveIds.length > 1)
    .sort((a, b) => b.savedAt - a.savedAt || a.key.localeCompare(b.key));
}

export function countSplitPosts(
  db: Db,
  hiddenFolderIds: readonly string[] = [],
): number {
  return CountRowSchema.parse(
    db.get(
      sql`select count(*) as n from (
        select 1 from ${saves}
        where ${splitMembersWhere(hiddenFolderIds)}
        group by ${saves.source}, ${splitPostSourceIdSql()}
        having count(*) > 1
      )`,
    ),
  ).n;
}
