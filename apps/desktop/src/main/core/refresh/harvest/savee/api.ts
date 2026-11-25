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
  captureFromItem,
  ItemByIdSchema,
  itemEntry,
  parseItems,
  UserItemsSchema,
  ViewerSchema,
} from "./normalize";

const GRAPHQL_URL = "https://savee.com/api/graphql/";
const PAGE_SIZE = 50;
const MAX_PAGES = 200;
const PAGE_GAP_MS = 300;

const ITEM_FIELDS = `fragment PondItem on Item {
  _id shortID url createdAt name pageURL
  user { username name url avatarURL }
  asset { type image { original thumbnail width height } }
}`;
const VIEWER_QUERY = "query PondViewer { auth { user { _id username } } }";
const ITEMS_QUERY = `query PondUserItems($username: NonEmptyString!, $limit: Int, $cursor: String) {
  userByUsername(username: $username) {
    items(sortMethod: newest_first, limit: $limit, cursor: $cursor) {
      items { ...PondItem }
      pageInfo { nextCursor isLimited }
    }
  }
}
${ITEM_FIELDS}`;
const ITEM_QUERY = `query PondItem($shortID: NonEmptyString!) { itemByShortID(shortID: $shortID) { ...PondItem } }
${ITEM_FIELDS}`;

/** One GraphQL POST carrying your Savee cookies, so tests can answer for the network. */
export type SaveePost = (body: string) => Promise<Response>;

interface SaveeVariables {
  username?: string;
  limit?: number;
  cursor?: string;
  shortID?: string;
}

type Json<T> = { ok: true; json: T } | { ok: false; status: number };

const EnvelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z
    .array(
      z.object({
        message: z.string().optional().catch(undefined),
        extensions: z
          .object({ code: z.string().optional().catch(undefined) })
          .optional()
          .catch(undefined),
      }),
    )
    .optional()
    .catch(undefined),
});

function sessionPost(partition: string): SaveePost {
  const ses = session.fromPartition(partition);
  const ua = browserUserAgent();
  return (body) =>
    ses.fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        accept: "*/*",
        "content-type": "application/json",
        "apollographql-client-name": "www",
        origin: "https://savee.com",
        referer: "https://savee.com/",
        "user-agent": ua,
      },
      body,
    });
}

async function saveeGraphql<T>(
  post: SaveePost,
  query: string,
  variables: SaveeVariables,
  schema: z.ZodType<T>,
): Promise<Json<T>> {
  let res: Response;
  try {
    res = await post(JSON.stringify({ query, variables }));
  } catch (error) {
    log.warn("[pond savee-api] fetch threw", error);
    return { ok: false, status: 0 };
  }
  if (res.status === 429) return { ok: false, status: 429 };
  try {
    const envelope = EnvelopeSchema.parse(await res.json());
    if (
      envelope.errors?.some((e) => e.extensions?.code === "UNAUTHENTICATED")
    ) {
      return { ok: false, status: 401 };
    }
    if ((envelope.errors?.length ?? 0) > 0 || !res.ok) {
      return { ok: false, status: res.status || 400 };
    }
    return { ok: true, json: schema.parse(envelope.data) };
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

async function viewerUsername(
  post: SaveePost,
): Promise<{ ok: true; username: string } | { ok: false; status: number }> {
  const viewer = await saveeGraphql(post, VIEWER_QUERY, {}, ViewerSchema);
  if (!viewer.ok) return viewer;
  const username = viewer.json.auth?.user?.username;
  return username ? { ok: true, username } : { ok: false, status: 401 };
}

export async function probeSaveeHandle(
  partition: string = PARTITION,
): Promise<string | null> {
  const viewer = await viewerUsername(sessionPost(partition));
  return viewer.ok ? viewer.username : null;
}

export async function readSaveeItems(
  args: ListHarvestArgs,
  post: SaveePost,
): Promise<ListHarvestResult> {
  const viewer = await viewerUsername(post);
  if (!viewer.ok) return failure(viewer.status);

  const known = new Set(args.knownIds);
  const earlyStop = args.earlyStop !== false && known.size > 0;
  const since = args.savedSince ? Date.parse(args.savedSince) : Number.NaN;
  const entries: Array<ListEntry> = [];
  let cursor = args.resumeCursor;
  let knownPageStreak = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const variables: SaveeVariables = {
      username: viewer.username,
      limit: PAGE_SIZE,
    };
    if (cursor) variables.cursor = cursor;
    const result = await saveeGraphql(
      post,
      ITEMS_QUERY,
      variables,
      UserItemsSchema,
    );
    if (!result.ok) {
      if (page === 0) return failure(result.status);
      log.warn("[pond savee-api] items page failed", result.status);
      return partial(entries, cursor);
    }
    const list = result.json.userByUsername?.items;
    const items = parseItems(list?.items ?? []);
    let fresh = 0;
    for (const item of items) {
      const savedAt = item.createdAt ? Date.parse(item.createdAt) : Number.NaN;
      if (
        Number.isFinite(since) &&
        Number.isFinite(savedAt) &&
        savedAt < since
      ) {
        return { ok: true, entries, reachedEnd: true, seen: entries.length };
      }
      if (!known.has(item.shortID)) fresh += 1;
      entries.push(itemEntry(item));
    }
    if (earlyStop && items.length > 0 && fresh === 0) {
      knownPageStreak += 1;
      if (knownPageStreak >= 2) {
        return { ok: true, entries, reachedEnd: true, seen: entries.length };
      }
    } else {
      knownPageStreak = 0;
    }
    const next = list?.pageInfo.nextCursor;
    if (!next || items.length === 0) {
      if (list?.pageInfo.isLimited) {
        log.warn("[pond savee-api] list is limited", entries.length);
      }
      return { ok: true, entries, reachedEnd: true, seen: entries.length };
    }
    cursor = next;
    await sleep(PAGE_GAP_MS);
  }
  return partial(entries, cursor);
}

function partial(
  entries: Array<ListEntry>,
  cursor: string | undefined,
): ListHarvestResult {
  const result: ListHarvestResult = {
    ok: true,
    entries,
    reachedEnd: false,
    seen: entries.length,
  };
  if (cursor) result.resumeCursor = cursor;
  return result;
}

export type SaveeCaptureResult =
  | { ok: true; capture: Capture }
  | { ok: false; reason: "not_found" | "auth_required" | "error" };

export async function readSaveeCapture(
  sourceId: string,
  post: SaveePost,
): Promise<SaveeCaptureResult> {
  const result = await saveeGraphql(
    post,
    ITEM_QUERY,
    { shortID: sourceId },
    ItemByIdSchema,
  );
  if (!result.ok) {
    if (result.status === 401 || result.status === 403) {
      return { ok: false, reason: "auth_required" };
    }
    return { ok: false, reason: "error" };
  }
  const item = result.json.itemByShortID;
  return item
    ? { ok: true, capture: captureFromItem(item) }
    : { ok: false, reason: "not_found" };
}

export async function harvestSaveeItems(
  args: ListHarvestArgs,
  partition?: string,
): Promise<ListHarvestResult> {
  return readSaveeItems(
    args,
    sessionPost(partition ?? (await partitionForIngest("savee"))),
  );
}

export async function fetchSaveeCapture(args: {
  sourceId: string;
  accountId?: string | null;
}): Promise<SaveeCaptureResult> {
  return readSaveeCapture(
    args.sourceId,
    sessionPost(await partitionForIngest("savee", args.accountId)),
  );
}
