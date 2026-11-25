import { setTimeout as sleep } from "node:timers/promises";
import type { ListKind } from "@pond/schema/db";
import type { Capture } from "@pond/schema/raw";
import { session } from "electron";
import log from "electron-log/main.js";
import { partitionForIngest } from "../../../sync/accounts";
import { mergeEntryListKinds, unionById } from "../../../sync/harvest-union";
import { browserUserAgent, PARTITION } from "../../harvest-window/constants";
import type {
  ListEntry,
  ListHarvestArgs,
  ListHarvestResult,
} from "../list-types";
import {
  captureFromVideo,
  clipEntry,
  clipRows,
  handleFromViewer,
  hasNextPage,
  parseVideos,
  VIDEO_FIELDS,
  VideosSchema,
  ViewerSchema,
} from "./normalize";
import type { VimeoVideo, VimeoViewer } from "./normalize";

const WEB = "https://vimeo.com";
const API = "https://api.vimeo.com";
const API_ACCEPT = "application/vnd.vimeo.*+json;version=3.4.10";
const ROWS_PER_PAGE = 12;
const MAX_PAGES = 100;
const PAGE_GAP_MS = 600;
const LIST_ORDER: ReadonlyArray<ListKind> = ["liked", "saved"];

interface VimeoHeaders {
  accept: string;
  authorization?: string;
  "x-requested-with"?: string;
}

/** One GET carrying your Vimeo cookies, so tests can answer for the network. */
export type VimeoGet = (
  url: string,
  headers: VimeoHeaders,
) => Promise<Response>;

/** The viewer token lasts about an hour, so a long walk refreshes it once on a 401. */
interface ApiAuth {
  jwt: string;
  refreshed: boolean;
}

interface WalkResult {
  entries: Array<ListEntry>;
  reachedEnd: boolean;
  nextPage: number;
}

type Walk =
  | ({ ok: true } & WalkResult)
  | Extract<ListHarvestResult, { ok: false }>;

function sessionGet(partition: string): VimeoGet {
  const ses = session.fromPartition(partition);
  const ua = browserUserAgent();
  return (url, headers) =>
    ses.fetch(url, { headers: { "user-agent": ua, ...headers } });
}

async function safeGet(
  get: VimeoGet,
  url: string,
  headers: VimeoHeaders,
): Promise<Response | null> {
  try {
    return await get(url, headers);
  } catch (error) {
    log.warn("[pond vimeo-api] fetch threw", url, error);
    return null;
  }
}

/** Signed out still returns a public token with `user: null`, which can read videos but not your lists. */
async function readViewer(get: VimeoGet): Promise<VimeoViewer | null> {
  const res = await safeGet(get, `${WEB}/_next/viewer`, {
    accept: "application/json",
  });
  if (!res?.ok) return null;
  try {
    return ViewerSchema.parse(await res.json());
  } catch {
    return null;
  }
}

function failure(status: number): Extract<ListHarvestResult, { ok: false }> {
  if (status === 401 || status === 403) {
    return { ok: false, reason: "auth_required" };
  }
  if (status === 429) return { ok: false, reason: "rate_limited" };
  return { ok: false, reason: "unknown" };
}

async function apiGet(
  get: VimeoGet,
  auth: ApiAuth,
  url: string,
): Promise<Response | null> {
  const send = () =>
    safeGet(get, url, {
      accept: API_ACCEPT,
      authorization: `jwt ${auth.jwt}`,
    });
  const res = await send();
  if (res?.status !== 401 || auth.refreshed) return res;
  auth.refreshed = true;
  const viewer = await readViewer(get);
  if (!viewer) return res;
  auth.jwt = viewer.jwt;
  return send();
}

/** One batch call per page fills in what the legacy rows leave out: title, author and poster. */
async function hydrate(
  get: VimeoGet,
  auth: ApiAuth,
  ids: ReadonlyArray<string>,
): Promise<Map<string, VimeoVideo>> {
  const query = new URLSearchParams({
    uris: ids.map((id) => `/videos/${id}`).join(","),
    fields: VIDEO_FIELDS,
    per_page: String(ids.length),
  });
  const res = await apiGet(get, auth, `${API}/videos?${query}`);
  if (!res?.ok) {
    log.warn("[pond vimeo-api] hydration failed", res?.status ?? 0);
    return new Map();
  }
  try {
    return parseVideos(VideosSchema.parse(await res.json()).data);
  } catch {
    return new Map();
  }
}

function signedOut(res: Response): boolean {
  if (res.status === 401 || res.status === 403) return true;
  try {
    return new URL(res.url).pathname.startsWith("/log_in");
  } catch {
    return false;
  }
}

/** Legacy pages server-render 12 rows each; the XHR form carries the rows without the page chrome. */
async function walkClips(
  get: VimeoGet,
  auth: ApiAuth,
  path: string,
  kind: ListKind,
  firstPage: number,
  args: ListHarvestArgs,
): Promise<Walk> {
  const known = new Set(args.knownIds);
  const earlyStop = args.earlyStop !== false && known.size > 0;
  const since = args.savedSince ? Date.parse(args.savedSince) : Number.NaN;
  const entries: Array<ListEntry> = [];
  let knownPageStreak = 0;

  for (let page = firstPage; page < firstPage + MAX_PAGES; page++) {
    const res = await safeGet(get, `${WEB}${path}page:${page}/`, {
      accept: "text/html",
      "x-requested-with": "XMLHttpRequest",
    });
    if (!res || signedOut(res) || !res.ok) {
      if (page === firstPage) {
        return res && signedOut(res)
          ? { ok: false, reason: "auth_required" }
          : failure(res?.status ?? 0);
      }
      log.warn("[pond vimeo-api] page failed", path, page, res?.status ?? 0);
      return { ok: true, entries, reachedEnd: false, nextPage: page };
    }
    const html = await res.text();
    const rows = clipRows(html);
    if (rows.length === 0) {
      return { ok: true, entries, reachedEnd: true, nextPage: page };
    }
    const videos = await hydrate(
      get,
      auth,
      rows.map((row) => row.id),
    );
    let fresh = 0;
    for (const row of rows) {
      if (Number.isFinite(since) && row.at && Date.parse(row.at) < since) {
        return { ok: true, entries, reachedEnd: true, nextPage: page };
      }
      if (!known.has(row.id)) fresh += 1;
      entries.push(clipEntry(row, videos.get(row.id), kind));
    }
    if (earlyStop && fresh === 0) {
      knownPageStreak += 1;
      if (knownPageStreak >= 2) {
        return { ok: true, entries, reachedEnd: true, nextPage: page + 1 };
      }
    } else {
      knownPageStreak = 0;
    }
    /** The XHR partial may drop `rel="next"`, so a full page still earns one more read. */
    if (!hasNextPage(html) && rows.length < ROWS_PER_PAGE) {
      return { ok: true, entries, reachedEnd: true, nextPage: page + 1 };
    }
    await sleep(PAGE_GAP_MS);
  }
  return {
    ok: true,
    entries,
    reachedEnd: false,
    nextPage: firstPage + MAX_PAGES,
  };
}

/** A backfill cursor names the list and page it stopped at, such as `liked:101`. */
function readCursor(
  cursor: string | undefined,
): { kind: ListKind; page: number } | null {
  const match = /^(liked|saved):(\d+)$/.exec(cursor ?? "");
  const kind = LIST_ORDER.find((k) => k === match?.[1]);
  const page = Number(match?.[2]);
  return kind && page > 0 ? { kind, page } : null;
}

export async function probeVimeoHandle(
  partition: string = PARTITION,
): Promise<string | null> {
  const viewer = await readViewer(sessionGet(partition));
  return viewer?.user ? handleFromViewer(viewer) : null;
}

/** Likes and Watch Later in one run, each skipped when the import leaves it out. */
export async function readVimeoLists(
  args: ListHarvestArgs,
  get: VimeoGet,
): Promise<ListHarvestResult> {
  const viewer = await readViewer(get);
  if (!viewer) return { ok: false, reason: "unknown" };
  if (!viewer.user) return { ok: false, reason: "auth_required" };
  const handle = handleFromViewer(viewer);
  const auth: ApiAuth = { jwt: viewer.jwt, refreshed: false };
  const wanted = args.listKinds ?? LIST_ORDER;
  const resume = readCursor(args.resumeCursor);
  const kinds = LIST_ORDER.filter(
    (kind) =>
      wanted.includes(kind) &&
      (!resume || LIST_ORDER.indexOf(kind) >= LIST_ORDER.indexOf(resume.kind)),
  );

  let entries: Array<ListEntry> = [];
  for (const kind of kinds) {
    if (kind === "liked" && !handle) {
      log.warn("[pond vimeo-api] no handle for likes");
      continue;
    }
    const path =
      kind === "liked"
        ? `/${encodeURIComponent(handle ?? "")}/likes/`
        : "/watchlater/";
    const firstPage = resume?.kind === kind ? resume.page : 1;
    const walk = await walkClips(get, auth, path, kind, firstPage, args);
    if (!walk.ok) {
      if (entries.length === 0) return walk;
      log.warn("[pond vimeo-api] list walk failed", kind, walk.reason);
      continue;
    }
    entries = unionById(
      entries,
      walk.entries,
      (e) => e.sourceId,
      mergeEntryListKinds,
    );
    if (!walk.reachedEnd) {
      return {
        ok: true,
        entries,
        reachedEnd: false,
        seen: entries.length,
        resumeCursor: `${kind}:${walk.nextPage}`,
      };
    }
  }
  log.info(
    `[pond vimeo-api] lists handle=${handle ?? "?"} entries=${entries.length}`,
  );
  return { ok: true, entries, reachedEnd: true, seen: entries.length };
}

export type VimeoCaptureResult =
  | { ok: true; capture: Capture }
  | { ok: false; reason: "not_found" | "error" };

/** Region-restricted videos answer 404 with error code 5451, which reads the same as gone. */
export async function readVimeoCapture(
  sourceId: string,
  get: VimeoGet,
): Promise<VimeoCaptureResult> {
  const viewer = await readViewer(get);
  if (!viewer) return { ok: false, reason: "error" };
  const auth: ApiAuth = { jwt: viewer.jwt, refreshed: false };
  const query = new URLSearchParams({ fields: VIDEO_FIELDS });
  const res = await apiGet(
    get,
    auth,
    `${API}/videos/${encodeURIComponent(sourceId)}?${query}`,
  );
  if (!res) return { ok: false, reason: "error" };
  if (res.status === 404) return { ok: false, reason: "not_found" };
  if (!res.ok) return { ok: false, reason: "error" };
  try {
    const video = parseVideos([await res.json()]).get(sourceId);
    return video
      ? { ok: true, capture: captureFromVideo(sourceId, video) }
      : { ok: false, reason: "not_found" };
  } catch {
    return { ok: false, reason: "error" };
  }
}

export async function harvestVimeoLists(
  args: ListHarvestArgs,
  partition?: string,
): Promise<ListHarvestResult> {
  return readVimeoLists(
    args,
    sessionGet(partition ?? (await partitionForIngest("vimeo"))),
  );
}

export async function fetchVimeoCapture(args: {
  sourceId: string;
  accountId?: string | null;
}): Promise<VimeoCaptureResult> {
  return readVimeoCapture(
    args.sourceId,
    sessionGet(await partitionForIngest("vimeo", args.accountId)),
  );
}
