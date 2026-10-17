import type { Capture, CaptureMedia, CaptureMetrics } from "@pond/schema/raw";
import { session } from "electron";
import log from "electron-log/main.js";
import type { z } from "zod";
import { partitionForIngest } from "../../../sync/accounts";
import {
  mergeEntryListKinds,
  stampListKind,
  unionById,
} from "../../../sync/harvest-union";
import { PARTITION } from "../../harvest-window/constants";
import type { ListHarvestArgs, ListHarvestResult } from "../list-types";
import {
  avatarFromMeJson,
  entriesFromListing,
  handleFromMeJson,
  RedditAccountSchema,
  type RedditListingKind,
  RedditListingSchema,
  RedditPostResponseSchema,
  redditListingUrl,
} from "./listing";

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

type JsonResult<T> =
  | { ok: true; json: T }
  | { ok: false; status: number; html: boolean };

async function fetchRedditJson<T>(
  partition: string,
  url: string,
  schema: z.ZodType<T>,
): Promise<JsonResult<T>> {
  const ses = session.fromPartition(partition);
  ses.setUserAgent(CHROME_UA);
  let res: Response;
  try {
    res = await ses.fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": CHROME_UA,
      },
    });
  } catch (err) {
    log.warn("[pond reddit-api] fetch threw", url, err);
    return { ok: false, status: 0, html: false };
  }
  const text = await res.text();
  const ct = res.headers.get("content-type") ?? "";
  const html = ct.includes("text/html") || text.trimStart().startsWith("<");
  if (!res.ok || html) {
    return { ok: false, status: res.status, html };
  }
  try {
    return { ok: true, json: schema.parse(JSON.parse(text)) };
  } catch {
    return { ok: false, status: res.status, html: false };
  }
}

export async function probeRedditHandle(
  partition: string = PARTITION,
): Promise<string | null> {
  for (const url of [
    "https://www.reddit.com/api/me.json?raw_json=1",
    "https://old.reddit.com/api/me.json?raw_json=1",
  ]) {
    const result = await fetchRedditJson(partition, url, RedditAccountSchema);
    if (!result.ok) continue;
    const handle = handleFromMeJson(result.json);
    if (handle) {
      log.info("[pond reddit-api] probed handle", handle);
      return handle;
    }
  }
  return null;
}

export async function fetchRedditAvatar(
  name: string,
  partition: string,
): Promise<string | null> {
  const me = await fetchRedditJson(
    partition,
    "https://www.reddit.com/api/me.json?raw_json=1",
    RedditAccountSchema,
  );
  if (me.ok) {
    const url = avatarFromMeJson(me.json);
    if (url) return url;
  }
  const about = await fetchRedditJson(
    partition,
    `https://www.reddit.com/user/${encodeURIComponent(name)}/about.json?raw_json=1`,
    RedditAccountSchema,
  );
  if (!about.ok) return null;
  return avatarFromMeJson(about.json);
}

async function harvestRedditListingJson(
  args: ListHarvestArgs & { accountKey?: string },
  kind: RedditListingKind,
  partition?: string,
): Promise<ListHarvestResult> {
  const jar = partition ?? (await partitionForIngest("reddit"));
  const handle = args.accountKey?.replace(/^u\//, "").trim() || "me";
  const known = new Set(args.knownIds.map(String));
  const earlyStopEnabled = args.earlyStop !== false && known.size > 0;
  const entries = [];
  let after: string | null = null;
  let knownPageStreak = 0;

  for (let page = 0; page < 200; page++) {
    const url = redditListingUrl(handle, kind, after);
    const result = await fetchRedditJson(jar, url, RedditListingSchema);
    if (!result.ok) {
      if (result.status === 401 || result.status === 403 || result.html) {
        return { ok: false, reason: "auth_required" };
      }
      if (result.status === 429) {
        return { ok: false, reason: "rate_limited" };
      }
      if (page === 0) return { ok: false, reason: "no_match" };
      break;
    }
    const pageData = entriesFromListing(result.json);
    if (page === 0 && pageData.entries.length === 0 && !pageData.after) {
      return { ok: true, entries: [], reachedEnd: true, seen: 0 };
    }
    let pageFresh = 0;
    for (const entry of pageData.entries) {
      if (!known.has(entry.sourceId)) pageFresh += 1;
      entries.push(entry);
    }
    if (earlyStopEnabled && pageData.entries.length > 0 && pageFresh === 0) {
      knownPageStreak += 1;
      if (knownPageStreak >= 2) {
        return { ok: true, entries, reachedEnd: true, seen: entries.length };
      }
    } else {
      knownPageStreak = 0;
    }
    if (!pageData.after) {
      log.info(
        `[pond reddit-api] ${kind} json handle=${handle} entries=${entries.length}`,
      );
      return { ok: true, entries, reachedEnd: true, seen: entries.length };
    }
    after = pageData.after;
    await sleep(400);
  }
  log.info(
    `[pond reddit-api] ${kind} json handle=${handle} entries=${entries.length} pages=200`,
  );
  return { ok: true, entries, reachedEnd: false, seen: entries.length };
}

export async function harvestRedditLists(
  args: ListHarvestArgs & { accountKey?: string },
  partition?: string,
): Promise<ListHarvestResult> {
  const kinds = args.listKinds ?? ["saved", "liked"];
  const saved = kinds.includes("saved")
    ? await harvestRedditListingJson(args, "saved", partition)
    : null;
  if (saved && !saved.ok) return saved;
  const savedEntries = saved ? stampListKind(saved.entries, "saved") : [];
  if (!kinds.includes("liked")) {
    return saved
      ? { ...saved, entries: savedEntries }
      : { ok: true, entries: [], reachedEnd: true };
  }
  const upvoted = await harvestRedditListingJson(args, "upvoted", partition);
  if (!upvoted.ok) {
    return saved ? { ...saved, entries: savedEntries } : upvoted;
  }
  const entries = unionById(
    savedEntries,
    stampListKind(upvoted.entries, "liked"),
    (e) => e.sourceId,
    mergeEntryListKinds,
  );
  return {
    ok: true,
    entries,
    reachedEnd: (saved?.reachedEnd ?? true) && upvoted.reachedEnd,
    seen: Math.max(saved?.seen ?? 0, upvoted.seen ?? 0, entries.length),
  };
}

type RedditCaptureExtras = { subreddit?: string };

export async function fetchRedditPostCapture(
  postId: string,
  partition?: string,
): Promise<Capture | null> {
  const jar = partition ?? (await partitionForIngest("reddit"));
  const url = `https://www.reddit.com/comments/${encodeURIComponent(postId)}.json?raw_json=1`;
  const result = await fetchRedditJson(jar, url, RedditPostResponseSchema);
  if (!result.ok) return null;
  const listing = Array.isArray(result.json) ? result.json[0] : result.json;
  const { entries } = entriesFromListing(listing ?? {});
  const entry = entries[0];
  if (!entry) return null;
  const media: CaptureMedia[] = [];
  for (const m of entry.mediaUrls ?? []) {
    const item: CaptureMedia = {
      url: m.url,
      type: m.type === "video" ? "video" : "image",
    };
    if (m.poster) item.posterUrl = m.poster;
    media.push(item);
  }
  const metrics: CaptureMetrics = {};
  if (entry.likes !== undefined) metrics.likes = entry.likes;
  if (entry.comments !== undefined) metrics.comments = entry.comments;
  const extras: RedditCaptureExtras = {};
  if (entry.subreddit) extras.subreddit = entry.subreddit;
  const capture: Capture = {
    id: postId,
    source: "reddit",
    url: entry.url,
    title: entry.title,
    description: entry.description,
    media,
  };
  if (entry.author) {
    capture.author = {
      handle: entry.author,
      profileUrl: `https://www.reddit.com/user/${entry.author}/`,
    };
  }
  if (entry.publishedAt) capture.publishedAt = entry.publishedAt;
  if (Object.keys(metrics).length > 0) capture.metrics = metrics;
  if (Object.keys(extras).length > 0) capture.extras = extras;
  return capture;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
