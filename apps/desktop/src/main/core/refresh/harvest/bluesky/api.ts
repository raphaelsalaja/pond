import { setTimeout as sleep } from "node:timers/promises";
import type { ListKind } from "@pond/schema/db";
import type { Capture } from "@pond/schema/raw";
import { session } from "electron";
import log from "electron-log/main.js";
import pLimit from "p-limit";
import { mergeEntryListKinds, unionById } from "../../../sync/harvest-union";
import {
  browserUserAgent,
  PUBLIC_PARTITION,
} from "../../harvest-window/constants";
import type {
  ListEntry,
  ListHarvestArgs,
  ListHarvestResult,
} from "../list-types";
import {
  APPVIEW,
  type AtGet,
  type BlueskyPost,
  LikesSchema,
  PostsSchema,
  ProfileSchema,
  pdsFor,
  readJson,
  resolveHandle,
  rkeyOf,
  tidToDate,
} from "./atproto";
import { captureFromPost, postEntry } from "./normalize";

const MAX_PAGES = 50;
const PAGE_SIZE = 100;
const HYDRATE_BATCH = 25;
const HYDRATE_CONCURRENCY = 2;
const PAGE_GAP_MS = 300;

/** Likes and posts are public, so reads use a jar no signed-in Source shares. */
export function publicGet(): AtGet {
  const ses = session.fromPartition(PUBLIC_PARTITION);
  const ua = browserUserAgent();
  return (url) =>
    ses.fetch(url, {
      headers: { "user-agent": ua, accept: "application/json" },
    });
}

function failure(status: number): Extract<ListHarvestResult, { ok: false }> {
  if (status === 429) return { ok: false, reason: "rate_limited" };
  return { ok: false, reason: "unknown" };
}

/** Posts that were deleted or hidden simply don't come back, so the map leaves them out. */
async function hydrate(
  get: AtGet,
  uris: readonly string[],
): Promise<Map<string, BlueskyPost>> {
  const posts = new Map<string, BlueskyPost>();
  const limit = pLimit(HYDRATE_CONCURRENCY);
  const batches: string[][] = [];
  for (let i = 0; i < uris.length; i += HYDRATE_BATCH) {
    batches.push(uris.slice(i, i + HYDRATE_BATCH));
  }
  await Promise.all(
    batches.map((batch) =>
      limit(async () => {
        const query = new URLSearchParams();
        for (const uri of batch) query.append("uris", uri);
        const res = await readJson(
          get,
          `${APPVIEW}/app.bsky.feed.getPosts?${query}`,
        );
        const parsed = PostsSchema.safeParse(res?.body);
        if (!parsed.success) {
          log.warn("[pond bluesky] hydration failed", res?.status ?? 0);
          return;
        }
        for (const post of parsed.data.posts) {
          if (post) posts.set(post.uri, post);
        }
      }),
    ),
  );
  return posts;
}

/** Your like records are public on your PDS, newest first, and each carries the exact liked-at time. */
export async function readBlueskyLikes(
  args: ListHarvestArgs,
  get: AtGet,
  did: string,
): Promise<ListHarvestResult> {
  const pds = await pdsFor(get, did);
  if (!pds) return { ok: false, reason: "unknown" };
  const known = new Set(args.knownIds);
  const earlyStop = args.earlyStop !== false && known.size > 0;
  const since = args.savedSince ? Date.parse(args.savedSince) : Number.NaN;
  const entries: ListEntry[] = [];
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

  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({
      repo: did,
      collection: "app.bsky.feed.like",
      limit: String(PAGE_SIZE),
    });
    if (cursor) query.set("cursor", cursor);
    const res = await readJson(
      get,
      `${pds}/xrpc/com.atproto.repo.listRecords?${query}`,
    );
    const parsed = LikesSchema.safeParse(res?.body);
    if (res?.status !== 200 || !parsed.success) {
      if (page === 0) return failure(res?.status ?? 0);
      log.warn("[pond bluesky] like page failed", res?.status ?? 0);
      return unfinished();
    }
    const records = parsed.data.records.flatMap((r) =>
      r?.value.subject.uri.includes("/app.bsky.feed.post/") ? [r] : [],
    );
    const posts = await hydrate(
      get,
      records.map((r) => r.value.subject.uri),
    );
    let fresh = 0;
    let read = 0;
    for (const record of records) {
      const likedAt =
        record.value.createdAt ?? tidToDate(rkeyOf(record.uri) ?? "");
      if (Number.isFinite(since) && likedAt && Date.parse(likedAt) < since) {
        return done();
      }
      const post = posts.get(record.value.subject.uri);
      if (!post) continue;
      const entry = postEntry(post, likedAt);
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
    await sleep(PAGE_GAP_MS);
  }
  return unfinished();
}

export type BlueskyCaptureResult =
  | { ok: true; capture: Capture }
  | { ok: false; reason: "not_found" | "error" };

/** `getPosts` rejects a handle inside an AT-URI, so the actor in the URL resolves to its DID first. */
export async function readBlueskyCapture(
  sourceId: string,
  url: string,
  get: AtGet,
): Promise<BlueskyCaptureResult> {
  const actor = /\/profile\/([^/?#]+)/.exec(url)?.[1];
  if (!actor) return { ok: false, reason: "error" };
  const did = await resolveHandle(get, decodeURIComponent(actor));
  if (!did) return { ok: false, reason: "not_found" };
  const query = new URLSearchParams({
    uris: `at://${did}/app.bsky.feed.post/${sourceId}`,
  });
  const res = await readJson(get, `${APPVIEW}/app.bsky.feed.getPosts?${query}`);
  if (res?.status !== 200) return { ok: false, reason: "error" };
  const parsed = PostsSchema.safeParse(res.body);
  if (!parsed.success) return { ok: false, reason: "error" };
  const post = parsed.data.posts.find((p) => p !== null);
  return post
    ? { ok: true, capture: captureFromPost(post) }
    : { ok: false, reason: "not_found" };
}

/** The Account keeps the handle the profile reports now, since a handle can move to a custom domain. */
export async function resolveProfile(
  get: AtGet,
  handle: string,
): Promise<{ did: string; handle: string } | null> {
  const did = await resolveHandle(get, handle);
  if (!did) return null;
  const res = await readJson(
    get,
    `${APPVIEW}/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
  );
  const profile = ProfileSchema.safeParse(res?.body);
  if (profile.success) {
    return { did: profile.data.did, handle: profile.data.handle };
  }
  return handle.startsWith("did:") ? null : { did, handle };
}

const LIST_ORDER: readonly ListKind[] = ["liked", "saved"];

export type BlueskyListReaders = Record<
  "liked" | "saved",
  (args: ListHarvestArgs) => Promise<ListHarvestResult>
>;

/** A cursor without a list prefix predates Bookmarks and belongs to likes. */
function readCursor(
  raw: string | undefined,
): { kind: "liked" | "saved"; cursor: string } | null {
  if (!raw) return null;
  if (raw.startsWith("saved:")) return { kind: "saved", cursor: raw.slice(6) };
  if (raw.startsWith("liked:")) return { kind: "liked", cursor: raw.slice(6) };
  return { kind: "liked", cursor: raw };
}

export async function readBlueskyLists(
  args: ListHarvestArgs,
  readers: BlueskyListReaders,
): Promise<ListHarvestResult> {
  const wanted = args.listKinds ?? LIST_ORDER;
  const resume = readCursor(args.resumeCursor);
  const kinds = (["liked", "saved"] as const).filter(
    (kind) =>
      wanted.includes(kind) &&
      (!resume || LIST_ORDER.indexOf(kind) >= LIST_ORDER.indexOf(resume.kind)),
  );
  let entries: ListEntry[] = [];
  for (const kind of kinds) {
    const { resumeCursor: _resumed, ...rest } = args;
    const listArgs: ListHarvestArgs = rest;
    if (resume?.kind === kind) listArgs.resumeCursor = resume.cursor;
    const walk = await readers[kind](listArgs);
    if (!walk.ok) {
      /** Bookmarks need a bsky.app sign-in that likes don't, so a signed-out page only skips that list. */
      const optional = kind === "saved" && wanted.includes("liked");
      if (!optional && entries.length === 0) return walk;
      log.warn("[pond bluesky] list walk failed", kind, walk.reason);
      continue;
    }
    entries = unionById(
      entries,
      walk.entries,
      (e) => e.sourceId,
      mergeEntryListKinds,
    );
    if (!walk.reachedEnd) {
      const result: ListHarvestResult = {
        ok: true,
        entries,
        reachedEnd: false,
        seen: entries.length,
      };
      if (walk.resumeCursor)
        result.resumeCursor = `${kind}:${walk.resumeCursor}`;
      return result;
    }
  }
  return { ok: true, entries, reachedEnd: true, seen: entries.length };
}

export async function harvestBlueskyLists(
  args: ListHarvestArgs,
  did: string | undefined,
  partition: string | undefined,
): Promise<ListHarvestResult> {
  if (!did) return { ok: false, reason: "auth_required" };
  return readBlueskyLists(args, {
    liked: (listArgs) => readBlueskyLikes(listArgs, publicGet(), did),
    saved: async (listArgs) => {
      const { harvestBlueskyBookmarks } = await import("./session");
      return harvestBlueskyBookmarks(listArgs, did, partition);
    },
  });
}

export async function fetchBlueskyCapture(args: {
  sourceId: string;
  url: string;
}): Promise<BlueskyCaptureResult> {
  return readBlueskyCapture(args.sourceId, args.url, publicGet());
}
