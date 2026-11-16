import { saves } from "@pond/schema/db";
import type { Capture, RawJson } from "@pond/schema/raw";
import { and, eq, inArray, isNull } from "drizzle-orm";
import log from "electron-log/main.js";
import { getDb } from "../../db";
import { persistSave } from "../persist-save";
import { runCaptureTweet } from "../pipeline/workers/capture-tweet";
import type { BookmarksEntry } from "../refresh/harvest/twitter";
import { buildTwitterBookmarkSeed } from "./twitter-seed";

const SEED_EXTRACTOR_ID = "twitter-bookmark-seed";
const SHORT_URL = /https?:\/\/t\.co\//i;
const ID_CHUNK = 400;

export function repairedCapture(
  rawJson: RawJson | null,
  entry: BookmarksEntry,
): Capture | null {
  if (rawJson?.extractorId !== SEED_EXTRACTOR_ID) return null;
  const fresh = buildTwitterBookmarkSeed(entry)?.rawJson.capture;
  if (!fresh) return null;
  const next = withFreshText(rawJson.capture, fresh);
  return next === rawJson.capture ? null : next;
}

function withFreshText(stored: Capture, fresh: Capture): Capture {
  const quoted =
    stored.quoted && fresh.quoted
      ? withFreshText(stored.quoted, fresh.quoted)
      : stored.quoted;
  const description = lostLinks(stored.description, fresh.description)
    ? fresh.description
    : stored.description;
  if (description === stored.description && quoted === stored.quoted) {
    return stored;
  }
  const next: Capture = { ...stored };
  if (description !== undefined) next.description = description;
  if (quoted) next.quoted = quoted;
  return next;
}

function lostLinks(
  stored: string | undefined,
  fresh: string | undefined,
): fresh is string {
  return (
    stored !== undefined &&
    fresh !== undefined &&
    stored !== fresh &&
    SHORT_URL.test(stored)
  );
}

export async function repairTweetLinks(
  entries: readonly BookmarksEntry[],
): Promise<number> {
  const byId = new Map(entries.map((e) => [e.tweetId, e]));
  if (byId.size === 0) return 0;
  const db = await getDb();
  const ids = [...byId.keys()];
  let repaired = 0;
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const rows = db
      .select({
        id: saves.id,
        sourceId: saves.sourceId,
        rawJson: saves.rawJson,
      })
      .from(saves)
      .where(
        and(
          eq(saves.source, "twitter"),
          inArray(saves.sourceId, ids.slice(i, i + ID_CHUNK)),
          isNull(saves.deletedAt),
        ),
      )
      .all();
    for (const row of rows) {
      const entry = byId.get(row.sourceId);
      if (!entry || !row.rawJson) continue;
      const capture = repairedCapture(row.rawJson, entry);
      if (!capture) continue;
      await persistSave(
        row.id,
        {
          rawJson: { ...row.rawJson, capture },
          description: capture.description ?? null,
        },
        { actorReason: "sync:twitter-link-repair" },
      );
      try {
        await runCaptureTweet(row.id, { nativeOnly: true, force: true });
      } catch (err) {
        log.warn(
          "[pond sync:twitter] link repair card redraw failed",
          row.id,
          err,
        );
      }
      repaired += 1;
    }
  }
  return repaired;
}
