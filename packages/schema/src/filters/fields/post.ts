import { type SQL, sql } from "drizzle-orm";
import { z } from "zod";
import { saves } from "../../db";
import type { ComparatorId, Predicate, PredicateValue } from "../types";
import { defineField } from "./descriptor";
import type { SaveLike } from "./save-like";

export interface SplitPostRef {
  source: string;
  sourceId: string;
}

/** Matches the `saves_split_post_idx` expression so post lookups stay on the index. */
export function splitPostSourceIdSql(): SQL<string | null> {
  return sql<string | null>`json_extract(${saves.rawSlim}, '$.split.sourceId')`;
}

/** Splitting writes the post's Source ID on the original and on every Save made from it. */
export function splitPostKey(
  save: Pick<SaveLike, "source" | "rawJson">,
): string | null {
  const sourceId = save.rawJson?.split?.sourceId;
  return save.source && sourceId ? `${save.source}:${sourceId}` : null;
}

export function parseSplitPostKey(key: string): SplitPostRef | null {
  const at = key.indexOf(":");
  if (at <= 0 || at === key.length - 1) return null;
  return { source: key.slice(0, at), sourceId: key.slice(at + 1) };
}

export function splitPostPredicate(key: string): Predicate {
  return { field: "post", operator: "eq", value: key };
}

function readSplitPost(raw: PredicateValue): SplitPostRef | null {
  const key = z.string().safeParse(raw);
  return key.success ? parseSplitPostKey(key.data) : null;
}

/** Source IDs are case-sensitive, so posts compare exactly instead of through the lowercased enum path. */
export function splitPostClause(
  operator: ComparatorId,
  raw: PredicateValue,
): SQL | null {
  const ref = readSplitPost(raw);
  if (!ref || (operator !== "eq" && operator !== "neq")) return null;
  const match = sql`(${saves.source} = ${ref.source} and ${splitPostSourceIdSql()} = ${ref.sourceId})`;
  return operator === "eq" ? match : sql`not coalesce(${match}, 0)`;
}

export function matchesSplitPost(
  operator: ComparatorId,
  raw: PredicateValue,
  save: SaveLike,
): boolean {
  const ref = readSplitPost(raw);
  const key = splitPostKey(save);
  const same = ref !== null && key === `${ref.source}:${ref.sourceId}`;
  if (operator === "eq") return same;
  if (operator === "neq") return !same;
  return false;
}

export const post = defineField({
  id: "post",
  type: "enum",
  label: "Split Post",
  group: "content",
  comparators: ["eq", "neq"],
  project: splitPostKey,
  sqlProjection: () => sql`${saves.source} || ':' || ${splitPostSourceIdSql()}`,
});
