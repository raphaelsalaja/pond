import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { session } from "electron";
import type { Session } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import { partitionForIngest } from "../../../sync/accounts";
import {
  browserUserAgent,
  NAV_TIMEOUT_MS,
  PARTITION,
} from "../../harvest-window/constants";
import { navigateWithTimeout } from "../../harvest-window/navigation";
import { leaseWindow } from "../../harvest-window/pool";
import type {
  ListEntry,
  ListHarvestArgs,
  ListHarvestResult,
} from "../list-types";
import {
  AppreciatedSchema,
  appreciationEntry,
  ViewerSchema,
} from "./normalize";

const WWW = "https://www.behance.net";
const GRAPHQL_URL = `${WWW}/v3/graphql`;
const MAX_PAGES = 200;
const PAGE_GAP_MS = 1500;

const VIEWER_QUERY = "query PondViewer { viewer { username } }";
const APPRECIATED_QUERY = `query PondAppreciated($username: String, $after: String) {
  user(username: $username) {
    appreciatedProjects(first: 24, after: $after) {
      pageInfo { endCursor hasNextPage }
      edges { cursor node { id name url publishedOn covers { size_original { url } size_808 { url } } owners { username displayName } } }
    }
  }
}`;

/** One GraphQL POST carrying your Behance cookies, so tests can answer for the network. */
export type BehancePost = (body: string) => Promise<Response>;

interface BehanceVariables {
  username?: string;
  after?: string | null;
}

interface GraphqlFailure {
  ok: false;
  status: number;
  challenge?: true;
}

type Json<T> = { ok: true; json: T } | GraphqlFailure;

/** A list result that can also say Fastly's JavaScript challenge blocked the call. */
export type BehanceListResult =
  | ListHarvestResult
  | { ok: false; reason: "page_error"; challenge: true };

const EnvelopeSchema = z.object({
  data: z.unknown().optional(),
  errors: z.array(z.unknown()).optional().catch(undefined),
});

/** GraphQL rejects a call unless the `bcp` cookie and `X-BCP` header carry the same client-made id. */
async function ensureBcp(ses: Session): Promise<string> {
  const [hit] = await ses.cookies.get({ url: WWW, name: "bcp" });
  if (hit?.value) {
    return hit.value;
  }
  const value = randomUUID();
  await ses.cookies.set({
    url: WWW,
    name: "bcp",
    value,
    path: "/",
    expirationDate: Math.floor(Date.now() / 1000) + 86_400,
  });
  return value;
}

function sessionPost(partition: string): BehancePost {
  const ses = session.fromPartition(partition);
  const ua = browserUserAgent();
  return async (body) => {
    const bcp = await ensureBcp(ses);
    return ses.fetch(GRAPHQL_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-bcp": bcp,
        "x-requested-with": "XMLHttpRequest",
        origin: WWW,
        referer: `${WWW}/`,
        "user-agent": ua,
      },
      body,
    });
  };
}

async function behanceGraphql<T>(
  post: BehancePost,
  query: string,
  variables: BehanceVariables,
  schema: z.ZodType<T>,
): Promise<Json<T>> {
  let res: Response;
  let text: string;
  try {
    res = await post(JSON.stringify({ query, variables }));
    text = await res.text();
  } catch (error) {
    log.warn("[pond behance-api] fetch threw", error);
    return { ok: false, status: 0 };
  }
  if (res.status === 429) {
    return { ok: false, status: 429 };
  }
  if (res.status === 403 && text.includes("js_challenge_value")) {
    return { ok: false, status: 403, challenge: true };
  }
  try {
    const envelope = EnvelopeSchema.parse(JSON.parse(text));
    if ((envelope.errors?.length ?? 0) > 0 || !res.ok) {
      return { ok: false, status: res.status || 400 };
    }
    return { ok: true, json: schema.parse(envelope.data) };
  } catch {
    return { ok: false, status: res.status || 0 };
  }
}

function failure(result: GraphqlFailure): BehanceListResult {
  if (result.challenge) {
    return { ok: false, reason: "page_error", challenge: true };
  }
  if (result.status === 401 || result.status === 403) {
    return { ok: false, reason: "auth_required" };
  }
  if (result.status === 429) {
    return { ok: false, reason: "rate_limited" };
  }
  return { ok: false, reason: "unknown" };
}

async function viewerUsername(
  post: BehancePost,
): Promise<{ ok: true; username: string } | GraphqlFailure> {
  const viewer = await behanceGraphql(post, VIEWER_QUERY, {}, ViewerSchema);
  if (!viewer.ok) {
    return viewer;
  }
  const username = viewer.json.viewer?.username;
  return username ? { ok: true, username } : { ok: false, status: 401 };
}

/** Fastly sets its challenge cookie from page JavaScript, so one real page load clears it for the session. */
async function warmBehance(partition: string): Promise<void> {
  const lease = await leaseWindow("behance", { partition });
  try {
    await navigateWithTimeout(lease.win, `${WWW}/`, NAV_TIMEOUT_MS);
    await sleep(3000);
  } finally {
    lease.release();
  }
}

export async function probeBehanceHandle(
  partition: string = PARTITION,
): Promise<string | null> {
  const post = sessionPost(partition);
  let viewer = await viewerUsername(post);
  if (!viewer.ok && viewer.challenge) {
    await warmBehance(partition);
    viewer = await viewerUsername(post);
  }
  return viewer.ok ? viewer.username : null;
}

export async function readBehanceAppreciations(
  args: ListHarvestArgs,
  post: BehancePost,
): Promise<BehanceListResult> {
  const viewer = await viewerUsername(post);
  if (!viewer.ok) {
    return failure(viewer);
  }

  const known = new Set(args.knownIds);
  const earlyStop = args.earlyStop !== false && known.size > 0;
  const since = args.savedSince ? Date.parse(args.savedSince) : Number.NaN;
  const entries: Array<ListEntry> = [];
  let cursor = args.resumeCursor;
  let knownPageStreak = 0;

  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await behanceGraphql(
      post,
      APPRECIATED_QUERY,
      { username: viewer.username, after: cursor ?? null },
      AppreciatedSchema,
    );
    if (!result.ok) {
      if (page === 0) {
        return failure(result);
      }
      log.warn("[pond behance-api] appreciations page failed", result.status);
      return partial(entries, cursor);
    }
    const list = result.json.user?.appreciatedProjects;
    let read = 0;
    let fresh = 0;
    for (const edge of list?.edges ?? []) {
      const entry = appreciationEntry(edge);
      if (!entry) {
        continue;
      }
      const savedAt = entry.savedAt ? Date.parse(entry.savedAt) : Number.NaN;
      if (
        Number.isFinite(since) &&
        Number.isFinite(savedAt) &&
        savedAt < since
      ) {
        return { ok: true, entries, reachedEnd: true, seen: entries.length };
      }
      read += 1;
      if (!known.has(entry.sourceId)) {
        fresh += 1;
      }
      entries.push(entry);
    }
    if (earlyStop && read > 0 && fresh === 0) {
      knownPageStreak += 1;
      if (knownPageStreak >= 2) {
        return { ok: true, entries, reachedEnd: true, seen: entries.length };
      }
    } else {
      knownPageStreak = 0;
    }
    const next = list?.pageInfo.endCursor;
    if (!list?.pageInfo.hasNextPage || !next || next === cursor) {
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
  if (cursor) {
    result.resumeCursor = cursor;
  }
  return result;
}

export async function harvestBehanceAppreciations(
  args: ListHarvestArgs,
  partition?: string,
): Promise<ListHarvestResult> {
  const jar = partition ?? (await partitionForIngest("behance"));
  const post = sessionPost(jar);
  const first = await readBehanceAppreciations(args, post);
  if (first.ok || !("challenge" in first)) {
    return first;
  }
  await warmBehance(jar);
  return readBehanceAppreciations(args, post);
}
