import type { JsonValue } from "@pond/schema/json";
import { z } from "zod";
import type {
  ListEntry,
  ListHarvestArgs,
  ListHarvestResult,
} from "../list-types";
import { PostSchema } from "./atproto";
import { postEntry } from "./normalize";

const MAX_PAGES = 50;

/** One page of `app.bsky.bookmark.getBookmarks`, fetched inside a signed-in bsky.app page. */
export type BookmarkPage = (
  cursor: string | undefined,
) => Promise<{ status: number; body: JsonValue } | null>;

const BookmarksSchema = z.object({
  bookmarks: z
    .array(
      z
        .object({
          createdAt: z.string().optional().catch(undefined),
          item: PostSchema.nullable().catch(null),
        })
        .nullable()
        .catch(null),
    )
    .catch([]),
  cursor: z.string().optional().catch(undefined),
});

function failure(status: number): Extract<ListHarvestResult, { ok: false }> {
  if (status === 401 || status === 400) {
    return { ok: false, reason: "auth_required" };
  }
  if (status === 429) return { ok: false, reason: "rate_limited" };
  return { ok: false, reason: "unknown" };
}

/** Bookmarks come newest first with the time you bookmarked each post, so they stop like the likes walk. */
export async function readBlueskyBookmarks(
  args: ListHarvestArgs,
  page: BookmarkPage,
): Promise<ListHarvestResult> {
  const known = new Set(args.knownIds);
  const earlyStop = args.earlyStop !== false && known.size > 0;
  const since = args.savedSince ? Date.parse(args.savedSince) : Number.NaN;
  const entries: Array<ListEntry> = [];
  const seen = new Set<string>();
  let cursor = args.resumeCursor;
  let knownStreak = 0;

  const done = (): ListHarvestResult => ({
    ok: true,
    entries,
    reachedEnd: true,
    seen: entries.length,
  });
  const unfinished = (): ListHarvestResult => {
    const result: ListHarvestResult = {
      ok: true,
      entries,
      reachedEnd: false,
      seen: entries.length,
    };
    if (cursor) result.resumeCursor = cursor;
    return result;
  };

  for (let n = 0; n < MAX_PAGES; n++) {
    const res = await page(cursor);
    const parsed = BookmarksSchema.safeParse(res?.body);
    if (res?.status !== 200 || !parsed.success) {
      if (n === 0) return failure(res?.status ?? 0);
      return unfinished();
    }
    let fresh = 0;
    let read = 0;
    for (const bookmark of parsed.data.bookmarks) {
      if (!bookmark?.item) continue;
      const { createdAt } = bookmark;
      if (
        Number.isFinite(since) &&
        createdAt &&
        Date.parse(createdAt) < since
      ) {
        return done();
      }
      const entry: ListEntry = {
        ...postEntry(bookmark.item, createdAt),
        listKinds: ["saved"],
      };
      if (seen.has(entry.sourceId)) continue;
      seen.add(entry.sourceId);
      read += 1;
      if (!known.has(entry.sourceId)) fresh += 1;
      entries.push(entry);
    }
    if (earlyStop && read > 0 && fresh === 0) {
      knownStreak += 1;
      if (knownStreak >= 2) return done();
    } else {
      knownStreak = 0;
    }
    if (!parsed.data.cursor) return done();
    cursor = parsed.data.cursor;
  }
  return unfinished();
}
