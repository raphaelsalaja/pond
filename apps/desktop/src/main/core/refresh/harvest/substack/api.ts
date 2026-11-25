import { setTimeout as sleep } from "node:timers/promises";
import type { ListKind } from "@pond/schema/db";
import type { Capture } from "@pond/schema/raw";
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
import type {
  ListEntry,
  ListHarvestArgs,
  ListHarvestResult,
} from "../list-types";
import {
  captureFromPost,
  feedItems,
  LikesPageSchema,
  PostByIdSchema,
  PostSchema,
  ProfileSchema,
  postEntry,
  ReaderPageSchema,
} from "./normalize";
import type { SubstackPublication } from "./normalize";

const CHROME_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const API = "https://substack.com/api/v1";
const MAX_PAGES = 50;
const PAGE_GAP_MS = 400;
const FEED_GAP_MS = 300;

type Fetched = { ok: true; res: Response } | { ok: false; status: number };

type Json<T> = { ok: true; json: T } | { ok: false; status: number };

/** One GET carrying your Substack cookies, so tests can answer for the network. */
export type SubstackGet = (url: string, accept: string) => Promise<Response>;

function sessionGet(partition: string): SubstackGet {
  const ses = session.fromPartition(partition);
  ses.setUserAgent(CHROME_UA);
  return (url, accept) =>
    ses.fetch(url, { headers: { accept, "user-agent": CHROME_UA } });
}

async function substackFetch(
  get: SubstackGet,
  url: string,
  accept = "application/json",
): Promise<Fetched> {
  try {
    const res = await get(url, accept);
    return res.ok ? { ok: true, res } : { ok: false, status: res.status };
  } catch (error) {
    log.warn("[pond substack-api] fetch threw", url, error);
    return { ok: false, status: 0 };
  }
}

async function substackJson<T>(
  get: SubstackGet,
  url: string,
  schema: z.ZodType<T>,
): Promise<Json<T>> {
  const result = await substackFetch(get, url);
  if (!result.ok) return result;
  try {
    return { ok: true, json: schema.parse(await result.res.json()) };
  } catch {
    return { ok: false, status: result.res.status || 0 };
  }
}

/** Anonymous visitors also get `substack.sid`, so only this endpoint proves you're signed in. */
async function fetchProfile(get: SubstackGet) {
  const result = await substackJson(
    get,
    `${API}/user/profile/self`,
    ProfileSchema,
  );
  return result.ok ? result.json : null;
}

export async function probeSubstackHandle(
  partition: string = PARTITION,
): Promise<string | null> {
  const profile = await fetchProfile(sessionGet(partition));
  return profile?.handle ?? (profile ? String(profile.id) : null);
}

function failure(status: number, first: boolean): ListHarvestResult | null {
  if (status === 401 || status === 403) {
    return { ok: false, reason: "auth_required" };
  }
  if (status === 429) return { ok: false, reason: "rate_limited" };
  return first ? { ok: false, reason: "unknown" } : null;
}

type Walk =
  | { ok: true; entries: Array<ListEntry>; reachedEnd: boolean }
  | Extract<ListHarvestResult, { ok: false }>;

async function walkSaved(
  get: SubstackGet,
  known: ReadonlySet<string>,
  earlyStop: boolean,
): Promise<Walk> {
  const entries: Array<ListEntry> = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ inboxType: "saved", limit: "20" });
    if (cursor) query.set("cursor", cursor);
    const result = await substackJson(
      get,
      `${API}/reader/posts?${query}`,
      ReaderPageSchema,
    );
    if (!result.ok) {
      const out = failure(result.status, page === 0);
      if (out?.ok === false) return out;
      return { ok: true, entries, reachedEnd: false };
    }
    const publications = new Map<number, SubstackPublication>();
    for (const pub of result.json.publications ?? []) {
      if (pub) publications.set(pub.id, pub);
    }
    let fresh = 0;
    const posts = (result.json.posts ?? []).flatMap((p) => (p ? [p] : []));
    for (const post of posts) {
      const pub =
        post.publication_id !== undefined && post.publication_id !== null
          ? publications.get(post.publication_id)
          : undefined;
      const entry = postEntry(post, pub, known);
      if (!known.has(entry.sourceId)) fresh += 1;
      entries.push(entry);
    }
    if (earlyStop && posts.length > 0 && fresh === 0) {
      return { ok: true, entries, reachedEnd: true };
    }
    cursor =
      result.json.more && result.json.cursor ? result.json.cursor : undefined;
    if (!cursor || posts.length === 0) {
      return { ok: true, entries, reachedEnd: true };
    }
    await sleep(PAGE_GAP_MS);
  }
  return { ok: true, entries, reachedEnd: false };
}

async function walkLiked(
  get: SubstackGet,
  userId: number,
  known: ReadonlySet<string>,
  earlyStop: boolean,
): Promise<Walk> {
  const entries: Array<ListEntry> = [];
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({ types: "like" });
    if (cursor) query.set("cursor", cursor);
    const result = await substackJson(
      get,
      `${API}/reader/feed/profile/${userId}?${query}`,
      LikesPageSchema,
    );
    if (!result.ok) {
      const out = failure(result.status, page === 0);
      if (out?.ok === false) return out;
      return { ok: true, entries, reachedEnd: false };
    }
    const items = (result.json.items ?? []).flatMap((i) => (i ? [i] : []));
    let fresh = 0;
    for (const item of items) {
      if (item.type !== "post" || !item.post) continue;
      const entry = postEntry(item.post, item.publication, known);
      if (!known.has(entry.sourceId)) fresh += 1;
      entries.push(entry);
    }
    if (earlyStop && items.length > 0 && fresh === 0) {
      return { ok: true, entries, reachedEnd: true };
    }
    cursor = result.json.nextCursor ?? undefined;
    if (!cursor || items.length === 0) {
      return { ok: true, entries, reachedEnd: true };
    }
    await sleep(PAGE_GAP_MS);
  }
  return { ok: true, entries, reachedEnd: false };
}

async function ingestGet(
  partition: string | undefined,
  accountId?: string | null,
): Promise<SubstackGet> {
  return sessionGet(
    partition ?? (await partitionForIngest("substack", accountId)),
  );
}

export async function harvestSubstackLists(
  args: ListHarvestArgs,
  partition?: string,
): Promise<ListHarvestResult> {
  return readSubstackLists(args, await ingestGet(partition));
}

export async function harvestSubstackSubscriptions(
  args: SubscriptionArgs,
  partition?: string,
): Promise<ListHarvestResult> {
  return readSubstackSubscriptions(args, await ingestGet(partition));
}

export async function fetchSubstackCapture(args: {
  sourceId: string;
  accountId?: string | null;
}): Promise<SubstackCaptureResult> {
  return readSubstackCapture(
    args.sourceId,
    await ingestGet(undefined, args.accountId),
  );
}

/** Saved posts and liked posts in one run, each skipped when the import leaves it out. */
export async function readSubstackLists(
  args: ListHarvestArgs,
  get: SubstackGet,
): Promise<ListHarvestResult> {
  const profile = await fetchProfile(get);
  if (!profile) return { ok: false, reason: "auth_required" };
  const known = new Set(args.knownIds);
  const earlyStop = args.earlyStop !== false && known.size > 0;
  const kinds: ReadonlyArray<ListKind> = args.listKinds ?? ["saved", "liked"];

  let entries: Array<ListEntry> = [];
  let reachedEnd = true;
  if (kinds.includes("saved")) {
    const saved = await walkSaved(get, known, earlyStop);
    if (!saved.ok) return saved;
    entries = stampListKind(saved.entries, "saved");
    reachedEnd &&= saved.reachedEnd;
  }
  if (kinds.includes("liked")) {
    const liked = await walkLiked(get, profile.id, known, earlyStop);
    if (!liked.ok) {
      if (entries.length === 0) return liked;
      log.warn("[pond substack-api] likes walk failed", liked.reason);
    } else {
      entries = unionById(
        entries,
        stampListKind(liked.entries, "liked"),
        (e) => e.sourceId,
        mergeEntryListKinds,
      );
      reachedEnd &&= liked.reachedEnd;
    }
  }
  log.info(
    `[pond substack-api] lists handle=${profile.handle ?? profile.id} entries=${entries.length}`,
  );
  return { ok: true, entries, reachedEnd, seen: entries.length };
}

/** Posts that publications you subscribe to published after `since`, newest first and capped. */
interface SubscriptionArgs {
  since: string;
  limit: number;
}

export async function readSubstackSubscriptions(
  args: SubscriptionArgs,
  get: SubstackGet,
): Promise<ListHarvestResult> {
  const profile = await fetchProfile(get);
  if (!profile) return { ok: false, reason: "auth_required" };
  const since = Date.parse(args.since);
  const subdomains = new Set<string>();
  for (const sub of profile.subscriptions ?? []) {
    const subdomain = sub?.publication?.subdomain;
    if (subdomain) subdomains.add(subdomain.toLowerCase());
  }

  const fresh: Array<ListEntry & { publishedAt: number }> = [];
  for (const subdomain of subdomains) {
    const result = await substackFetch(
      get,
      `https://${subdomain}.substack.com/feed`,
      "application/rss+xml, application/xml;q=0.9",
    );
    if (!result.ok) {
      if (result.status === 429) break;
      continue;
    }
    const xml = await result.res.text().catch(() => "");
    for (const item of feedItems(xml, subdomain)) {
      const published = item.publishedAt ? Date.parse(item.publishedAt) : 0;
      if (!(published > since)) continue;
      const entry: ListEntry & { publishedAt: number } = {
        sourceId: item.sourceId,
        url: item.url,
        listKinds: ["subscription"],
        publishedAt: published,
      };
      if (item.title) entry.title = item.title;
      if (item.author) entry.author = item.author;
      if (item.mediaUrl) {
        entry.mediaUrl = item.mediaUrl;
        entry.mediaType = "image";
      }
      fresh.push(entry);
    }
    await sleep(FEED_GAP_MS);
  }
  fresh.sort((a, b) => b.publishedAt - a.publishedAt);
  const entries = fresh
    .slice(0, args.limit)
    .map(({ publishedAt: _publishedAt, ...entry }) => entry);
  log.info(
    `[pond substack-api] subscriptions feeds=${subdomains.size} new=${fresh.length} queued=${entries.length}`,
  );
  return {
    ok: true,
    entries,
    reachedEnd: fresh.length <= args.limit,
    seen: fresh.length,
  };
}

export type SubstackCaptureResult =
  | { ok: true; capture: Capture }
  | { ok: false; reason: "not_found" | "auth_required" | "error" };

/** Reads the post as JSON; the signed-in `by-id` lookup returns the full body of posts you pay for. */
export async function readSubstackCapture(
  sourceId: string,
  get: SubstackGet,
): Promise<SubstackCaptureResult> {
  let postId = /^p-(\d+)$/.exec(sourceId)?.[1];
  let fallback: z.infer<typeof PostSchema> | null = null;
  const slugPath = /^([a-z0-9-]+)\.substack\.com\/p\/([A-Za-z0-9_-]+)$/i.exec(
    sourceId,
  );
  if (!postId && slugPath) {
    const [, subdomain, slug] = slugPath;
    const bySlug = await substackJson(
      get,
      `https://${subdomain}.substack.com/api/v1/posts/${slug}`,
      PostSchema,
    );
    if (!bySlug.ok) return { ok: false, reason: reasonFor(bySlug.status) };
    fallback = bySlug.json;
    postId = String(bySlug.json.id);
  }
  if (!postId) return { ok: false, reason: "not_found" };

  const url = slugPath
    ? `https://${sourceId}`
    : `https://substack.com/home/post/p-${postId}`;
  const byId = await substackJson(
    get,
    `${API}/posts/by-id/${postId}`,
    PostByIdSchema,
  );
  if (byId.ok) {
    return {
      ok: true,
      capture: captureFromPost(
        byId.json.post,
        byId.json.publication,
        sourceId,
        url,
      ),
    };
  }
  if (fallback) {
    return {
      ok: true,
      capture: captureFromPost(fallback, null, sourceId, url),
    };
  }
  return { ok: false, reason: reasonFor(byId.status) };
}

function reasonFor(status: number): "not_found" | "auth_required" | "error" {
  if (status === 404) return "not_found";
  if (status === 401 || status === 403) return "auth_required";
  return "error";
}
