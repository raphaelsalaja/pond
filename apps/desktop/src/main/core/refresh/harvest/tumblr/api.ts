import { setTimeout as sleep } from "node:timers/promises";
import type { Capture } from "@pond/schema/raw";
import { session } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import { partitionForIngest } from "../../../sync/accounts";
import { browserUserAgent, PARTITION } from "../../harvest-window/constants";
import type {
  ListEntry,
  ListHarvestArgs,
  ListHarvestResult,
} from "../list-types";
import {
  blogFromUrl,
  captureFromPost,
  LikesPageSchema,
  PermalinkSchema,
  parsePosts,
  postEntry,
  primaryBlog,
  UserInfoSchema,
} from "./normalize";

const WWW = "https://www.tumblr.com";
const PAGE_SIZE = 20;
const MAX_PAGES = 100;
const PAGE_GAP_MS = 400;

interface TumblrHeaders {
  accept: string;
  authorization?: string;
  "x-version"?: string;
}

/** One GET carrying your Tumblr cookies, so tests can answer for the network. */
export type TumblrGet = (
  url: string,
  headers: TumblrHeaders,
) => Promise<Response>;

type Json<T> = { ok: true; json: T } | { ok: false; status: number };

const StateSchema = z.object({
  apiFetchStore: z.object({ API_TOKEN: z.string().min(1) }),
});

function sessionGet(partition: string): TumblrGet {
  const ses = session.fromPartition(partition);
  const ua = browserUserAgent();
  return (url, headers) =>
    ses.fetch(url, { headers: { "user-agent": ua, ...headers } });
}

/** The web app's bearer is an app token embedded in every `www` page; your `sid` cookie carries the account. */
async function readToken(get: TumblrGet): Promise<string | null> {
  try {
    const res = await get(`${WWW}/`, { accept: "text/html" });
    if (!res.ok) return null;
    const html = await res.text();
    const raw =
      /<script[^>]*id="___INITIAL_STATE___"[^>]*>([\s\S]*?)<\/script>/.exec(
        html,
      )?.[1];
    if (!raw) return null;
    return StateSchema.parse(JSON.parse(raw)).apiFetchStore.API_TOKEN;
  } catch (error) {
    log.warn("[pond tumblr-api] token read failed", error);
    return null;
  }
}

async function tumblrJson<T>(
  get: TumblrGet,
  token: string,
  path: string,
  schema: z.ZodType<T>,
): Promise<Json<T>> {
  let res: Response;
  try {
    res = await get(`${WWW}/api${path}`, {
      accept: "application/json;format=camelcase",
      authorization: `Bearer ${token}`,
      "x-version": "redpop/3/0//redpop/",
    });
  } catch (error) {
    log.warn("[pond tumblr-api] fetch threw", path, error);
    return { ok: false, status: 0 };
  }
  if (!res.ok) return { ok: false, status: res.status };
  try {
    return { ok: true, json: schema.parse(await res.json()) };
  } catch {
    return { ok: false, status: res.status || 0 };
  }
}

function failure(status: number): Extract<ListHarvestResult, { ok: false }> {
  if (status === 401 || status === 403) {
    return { ok: false, reason: "auth_required" };
  }
  if (status === 429) return { ok: false, reason: "rate_limited" };
  return { ok: false, reason: "unknown" };
}

export async function probeTumblrHandle(
  partition: string = PARTITION,
): Promise<string | null> {
  const get = sessionGet(partition);
  const token = await readToken(get);
  if (!token) return null;
  const info = await tumblrJson(get, token, "/v2/user/info", UserInfoSchema);
  return info.ok ? primaryBlog(info.json.response.user) : null;
}

export async function readTumblrLikes(
  args: ListHarvestArgs,
  get: TumblrGet,
): Promise<ListHarvestResult> {
  const token = await readToken(get);
  if (!token) return { ok: false, reason: "unknown" };
  const info = await tumblrJson(get, token, "/v2/user/info", UserInfoSchema);
  if (!info.ok) return failure(info.status);

  const known = new Set(args.knownIds);
  const earlyStop = args.earlyStop !== false && known.size > 0;
  const since = args.savedSince ? Date.parse(args.savedSince) : Number.NaN;
  const entries: Array<ListEntry> = [];
  let before = args.resumeCursor;
  let knownPageStreak = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const query = new URLSearchParams({
      limit: String(PAGE_SIZE),
      reblog_info: "true",
    });
    if (before) query.set("before", before);
    const result = await tumblrJson(
      get,
      token,
      `/v2/user/likes?${query}`,
      LikesPageSchema,
    );
    if (!result.ok) {
      if (page === 0) return failure(result.status);
      log.warn("[pond tumblr-api] likes page failed", result.status);
      return partial(entries, before);
    }
    const posts = parsePosts(result.json.response.likedPosts);
    let fresh = 0;
    for (const post of posts) {
      if (
        Number.isFinite(since) &&
        post.likedTimestamp !== undefined &&
        post.likedTimestamp * 1000 < since
      ) {
        return { ok: true, entries, reachedEnd: true, seen: entries.length };
      }
      if (!known.has(post.idString)) fresh += 1;
      entries.push(postEntry(post));
    }
    if (earlyStop && posts.length > 0 && fresh === 0) {
      knownPageStreak += 1;
      if (knownPageStreak >= 2) {
        return { ok: true, entries, reachedEnd: true, seen: entries.length };
      }
    } else {
      knownPageStreak = 0;
    }
    const next =
      result.json.response.links?.next?.queryParams.before ??
      posts.at(-1)?.likedTimestamp?.toString();
    if (posts.length === 0 || !next) {
      return { ok: true, entries, reachedEnd: true, seen: entries.length };
    }
    before = next;
    await sleep(PAGE_GAP_MS);
  }
  return partial(entries, before);
}

function partial(
  entries: Array<ListEntry>,
  before: string | undefined,
): ListHarvestResult {
  const result: ListHarvestResult = {
    ok: true,
    entries,
    reachedEnd: false,
    seen: entries.length,
  };
  if (before) result.resumeCursor = before;
  return result;
}

export type TumblrCaptureResult =
  | { ok: true; capture: Capture }
  | { ok: false; reason: "not_found" | "auth_required" | "error" };

export async function readTumblrCapture(
  sourceId: string,
  url: string,
  get: TumblrGet,
): Promise<TumblrCaptureResult> {
  const blog = blogFromUrl(url);
  if (!blog) return { ok: false, reason: "not_found" };
  const token = await readToken(get);
  if (!token) return { ok: false, reason: "error" };
  const result = await tumblrJson(
    get,
    token,
    `/v2/blog/${encodeURIComponent(blog)}/posts/${sourceId}/permalink`,
    PermalinkSchema,
  );
  if (!result.ok) {
    if (result.status === 404) return { ok: false, reason: "not_found" };
    if (result.status === 401 || result.status === 403) {
      return { ok: false, reason: "auth_required" };
    }
    return { ok: false, reason: "error" };
  }
  const [post] = parsePosts(result.json.response.timeline.elements);
  return post
    ? { ok: true, capture: captureFromPost(post) }
    : { ok: false, reason: "not_found" };
}

export async function harvestTumblrLikes(
  args: ListHarvestArgs,
  partition?: string,
): Promise<ListHarvestResult> {
  return readTumblrLikes(
    args,
    sessionGet(partition ?? (await partitionForIngest("tumblr"))),
  );
}

export async function fetchTumblrCapture(args: {
  sourceId: string;
  url: string;
  accountId?: string | null;
}): Promise<TumblrCaptureResult> {
  return readTumblrCapture(
    args.sourceId,
    args.url,
    sessionGet(await partitionForIngest("tumblr", args.accountId)),
  );
}
