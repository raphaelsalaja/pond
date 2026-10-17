import type { JsonValue } from "@pond/schema/json";
import type { ImportCollectionOption } from "@shared/import-scope";
import { z } from "zod";

export const YOUTUBE_PLAYLISTS_URL = "https://www.youtube.com/feed/playlists";
const YOUTUBE_WATCH_LATER_ID = "WL";
/** Liked videos is its own list kind, so it never shows up as a playlist choice. */
const LIKED_PLAYLIST_ID = "LL";

export const READ_YOUTUBE_INITIAL_DATA =
  "JSON.stringify(globalThis.ytInitialData ?? null)";

const Text = z.string().optional().catch(undefined);

const LockupSchema = z
  .object({
    contentType: Text,
    contentId: Text,
    metadata: z
      .object({
        lockupMetadataViewModel: z
          .object({ title: z.object({ content: Text }).optional() })
          .optional(),
      })
      .optional()
      .catch(undefined),
  })
  .catch({});

const GridPlaylistSchema = z
  .object({
    playlistId: Text,
    title: z
      .object({
        simpleText: Text,
        runs: z
          .array(z.object({ text: Text }))
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
    videoCountText: z
      .object({
        simpleText: Text,
        runs: z
          .array(z.object({ text: Text }))
          .optional()
          .catch(undefined),
      })
      .optional()
      .catch(undefined),
  })
  .catch({});

/** Reads your playlists from the playlists feed, with Watch Later first since it's the list Pond walks by default. */
export function parseYoutubePlaylists(
  data: JsonValue,
): ImportCollectionOption[] {
  const out: ImportCollectionOption[] = [
    { id: YOUTUBE_WATCH_LATER_ID, name: "Watch Later", itemCount: null },
  ];
  const seen = new Set([YOUTUBE_WATCH_LATER_ID, LIKED_PLAYLIST_ID]);
  const add = (
    id: string | undefined,
    name: string,
    itemCount: number | null,
  ) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    out.push({ id, name: name || id, itemCount });
  };
  walk(data, (key, value) => {
    if (key === "lockupViewModel") {
      const lockup = LockupSchema.parse(value);
      if (lockup.contentType !== "LOCKUP_CONTENT_TYPE_PLAYLIST") return;
      add(
        lockup.contentId,
        lockup.metadata?.lockupMetadataViewModel?.title?.content ?? "",
        videoCount(value),
      );
    } else if (key === "gridPlaylistRenderer") {
      const grid = GridPlaylistSchema.parse(value);
      const title =
        grid.title?.simpleText ??
        grid.title?.runs?.map((run) => run.text ?? "").join("") ??
        "";
      const count =
        grid.videoCountText?.simpleText ??
        grid.videoCountText?.runs?.map((run) => run.text ?? "").join("");
      add(grid.playlistId, title, count ? parseCount(count) : null);
    }
  });
  return out;
}

function videoCount(lockup: JsonValue): number | null {
  let count: number | null = null;
  walk(lockup, (key, value) => {
    if (count !== null || key !== "text") return;
    const text = Text.parse(value);
    if (text && /\bvideos?\b/i.test(text)) count = parseCount(text);
  });
  return count;
}

function parseCount(text: string): number | null {
  const digits = /(\d[\d,.]*)/.exec(text)?.[1]?.replace(/[,.]/g, "");
  return digits ? Number(digits) : null;
}

function walk(
  value: JsonValue,
  visit: (key: string, value: JsonValue) => void,
): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (!(value instanceof Object)) return;
  for (const [key, child] of Object.entries(value)) {
    visit(key, child);
    walk(child, visit);
  }
}
