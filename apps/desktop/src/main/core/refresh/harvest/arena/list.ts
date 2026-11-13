import type { Source } from "@pond/schema/db";
import { session } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import { AuthRequiredError } from "../../../pipeline/extractors/errors";
import { acquire, report } from "../../../pipeline/rate-governor";
import { partitionForIngest } from "../../../sync/accounts";
import { browserUserAgent } from "../../harvest-window/constants";
import { looksLikeAuthWall } from "../../harvest-window/navigation";
import type {
  ListEntry,
  ListHarvestArgs,
  ListHarvestResult,
} from "../list-types";

/** Are.na refuses a contents page larger than this, and that first page is not the library. */
const PER_PAGE = 100;
/** The contents API only serves the first 10,000 results (`per` × pages). */
const MAX_PAGES = 100;
const API_BASE = "https://api.are.na/v3";

const ARENA_SOURCE = "arena" satisfies Source;

type ContentsKind = "users" | "groups";

export type ArenaGet = (url: string) => Promise<Response>;

const ArenaBlockRowSchema = z
  .object({
    id: z.union([z.number(), z.string()]).nullish().catch(null),
    base_type: z.string().nullish().catch(null),
    type: z.string().nullish().catch(null),
    title: z.string().nullish().catch(null),
    created_at: z.string().nullish().catch(null),
  })
  .catch({});

const ArenaContentsSchema = z.object({
  data: z.array(ArenaBlockRowSchema).nullish().catch(null),
  meta: z
    .object({
      has_more_pages: z.boolean().nullish().catch(null),
      total_pages: z.number().nullish().catch(null),
    })
    .nullish()
    .catch(null),
});

const ArenaSessionSchema = z
  .object({
    props: z
      .object({
        user: z
          .object({
            authentication_token: z.string().nullish().catch(null),
          })
          .nullish()
          .catch(null),
      })
      .nullish()
      .catch(null),
  })
  .catch({});

interface ArenaListArgs extends ListHarvestArgs {
  accountKey?: string;
}

interface PageCursor {
  kind: ContentsKind;
  page: number;
}

function arenaProfileUrl(slug: string): string {
  return `https://www.are.na/${encodeURIComponent(slug)}/all`;
}

function contentsUrl(kind: ContentsKind, slug: string, page: number): string {
  const query = new URLSearchParams({
    page: String(page),
    per: String(PER_PAGE),
    sort: "created_at_desc",
    type: "Block",
  });
  return `${API_BASE}/${kind}/${encodeURIComponent(slug)}/contents?${query}`;
}

function accountSlug(accountKey: string | undefined): string {
  return accountKey?.trim().replace(/^@/, "") ?? "";
}

function readCursor(cursor: string | undefined): PageCursor | null {
  const match = /^(user|group):(\d+)$/.exec(cursor ?? "");
  const page = Number(match?.[2]);
  if (!match || !Number.isInteger(page) || page < 1) return null;
  return { kind: match[1] === "group" ? "groups" : "users", page };
}

function writeCursor(kind: ContentsKind, page: number): string {
  return `${kind === "groups" ? "group" : "user"}:${page}`;
}

/** The signed-in profile embeds the session token. It is sent as a bearer and never logged. */
export function arenaAccessToken(html: string): string | null {
  const open = html.indexOf('<script id="__NEXT_DATA__"');
  if (open < 0) return null;
  const start = html.indexOf(">", open);
  const end = html.indexOf("</script>", start);
  if (start < 0 || end < 0) return null;
  try {
    const parsed = ArenaSessionSchema.parse(
      JSON.parse(html.slice(start + 1, end)),
    );
    const token = parsed.props?.user?.authentication_token;
    return token && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function failure(status: number, retryAfterSec?: number): ListHarvestResult {
  if (status === 401 || status === 403) {
    return { ok: false, reason: "auth_required" };
  }
  if (status === 429) {
    return retryAfterSec && retryAfterSec > 0
      ? { ok: false, reason: "rate_limited", retryAfterSec }
      : { ok: false, reason: "rate_limited" };
  }
  if (status === 404) return { ok: false, reason: "no_match" };
  return { ok: false, reason: "unknown" };
}

function retryAfterSec(res: Response): number | undefined {
  const retry = Number(res.headers.get("retry-after"));
  return Number.isFinite(retry) && retry > 0 ? retry : undefined;
}

function blockEntry(
  row: z.infer<typeof ArenaBlockRowSchema>,
): ListEntry | null {
  const kind = (row.base_type ?? row.type ?? "").toLowerCase();
  if (kind === "channel") return null;
  const id = row.id != null ? String(row.id).trim() : "";
  if (!id) return null;
  const entry: ListEntry = {
    sourceId: id,
    url: `https://www.are.na/block/${id}`,
  };
  const title = row.title?.trim();
  if (title) entry.title = title;
  if (row.created_at) entry.savedAt = row.created_at;
  return entry;
}

/**
 * Pages through every block Are.na will return for the account. `has_more_pages`
 * is the end of the list; stopping after page 1 recorded a finished full sync
 * and later runs reported no new saves.
 */
export async function readArenaBlocks(
  args: ArenaListArgs,
  get: ArenaGet,
): Promise<ListHarvestResult> {
  const slug = accountSlug(args.accountKey);
  if (!slug) return { ok: false, reason: "auth_required" };

  const known = new Set(args.knownIds);
  const earlyStop = args.earlyStop !== false && known.size > 0;
  const resume = readCursor(args.resumeCursor);
  let kind: ContentsKind = resume?.kind ?? "users";
  let page = resume?.page ?? 1;
  let tryGroup = resume == null;
  const entries: ListEntry[] = [];
  const seen = new Set<string>();
  let knownStreak = 0;
  let fetched = 0;

  function finished(): ListHarvestResult {
    return { ok: true, entries, reachedEnd: true, seen: entries.length };
  }

  function unfinished(): ListHarvestResult {
    return {
      ok: true,
      entries,
      reachedEnd: false,
      seen: entries.length,
      resumeCursor: writeCursor(kind, page),
    };
  }

  while (fetched < MAX_PAGES) {
    const res = await get(contentsUrl(kind, slug, page));
    if (res.status === 404 && tryGroup && kind === "users") {
      kind = "groups";
      page = 1;
      tryGroup = false;
      continue;
    }
    tryGroup = false;
    fetched += 1;
    if (res.status === 400 && page > 1) return finished();
    if (!res.ok) {
      if (entries.length === 0) return failure(res.status, retryAfterSec(res));
      return unfinished();
    }

    let parsed: z.infer<typeof ArenaContentsSchema>;
    try {
      parsed = ArenaContentsSchema.parse(await res.json());
    } catch (err) {
      log.warn(
        "[pond arena:list] contents parse failed",
        kind,
        page,
        err instanceof Error ? err.message : "error",
      );
      if (entries.length === 0) return { ok: false, reason: "unknown" };
      return unfinished();
    }

    const rows = parsed.data ?? [];
    let pageFresh = 0;
    for (const row of rows) {
      const entry = blockEntry(row);
      if (!entry || seen.has(entry.sourceId)) continue;
      seen.add(entry.sourceId);
      if (!known.has(entry.sourceId)) pageFresh += 1;
      entries.push(entry);
    }

    const hasMore = parsed.meta?.has_more_pages;
    const totalPages = parsed.meta?.total_pages;
    const end =
      rows.length === 0 ||
      hasMore === false ||
      (totalPages != null && page >= totalPages) ||
      (hasMore !== true && rows.length < PER_PAGE);
    if (end || page >= MAX_PAGES) return finished();

    if (earlyStop && pageFresh === 0) {
      knownStreak += 1;
      if (knownStreak >= 2) {
        return { ok: true, entries, reachedEnd: true, seen: entries.length };
      }
    } else {
      knownStreak = 0;
    }
    page += 1;
  }
  return unfinished();
}

async function pacedFetch(
  partition: string,
  url: string,
  headers: Record<string, string>,
): Promise<Response> {
  try {
    await acquire(ARENA_SOURCE);
  } catch (err) {
    if (err instanceof AuthRequiredError) {
      return new Response(null, { status: 401 });
    }
    return new Response(null, {
      status: 429,
      headers: { "retry-after": "60" },
    });
  }
  try {
    const res = await session.fromPartition(partition).fetch(url, { headers });
    report(ARENA_SOURCE, {
      ok: res.ok,
      status: res.status,
      headers: res.headers,
    });
    return res;
  } catch (err) {
    log.warn(
      "[pond arena:list] fetch failed",
      err instanceof Error ? err.message : "error",
    );
    report(ARENA_SOURCE, { ok: false });
    return new Response(null, { status: 503 });
  }
}

/** Reads the profile the signed-in window would, and returns its session token when present. */
async function readArenaAccessToken(
  partition: string,
  slug: string,
): Promise<string | null | "signed_out"> {
  const res = await pacedFetch(partition, arenaProfileUrl(slug), {
    accept: "text/html",
    "user-agent": browserUserAgent(),
  });
  if (res.status === 401 || res.status === 403 || looksLikeAuthWall(res.url)) {
    return "signed_out";
  }
  if (!res.ok) return null;
  try {
    return arenaAccessToken(await res.text());
  } catch (err) {
    log.warn(
      "[pond arena:list] profile parse failed",
      err instanceof Error ? err.message : "error",
    );
    return null;
  }
}

function sessionGet(partition: string, token: string | null): ArenaGet {
  const accept = "application/json";
  const userAgent = browserUserAgent();
  if (!token) {
    return (url) =>
      pacedFetch(partition, url, { accept, "user-agent": userAgent });
  }
  const authorization = `Bearer ${token}`;
  return (url) =>
    pacedFetch(partition, url, {
      accept,
      authorization,
      "user-agent": userAgent,
    });
}

export async function harvestArenaBlocks(
  args: ArenaListArgs,
  partition?: string,
): Promise<ListHarvestResult> {
  const slug = accountSlug(args.accountKey);
  if (!slug) return { ok: false, reason: "auth_required" };
  const part = partition ?? (await partitionForIngest(ARENA_SOURCE));
  const token = await readArenaAccessToken(part, slug);
  if (token === "signed_out") return { ok: false, reason: "auth_required" };
  return readArenaBlocks(args, sessionGet(part, token));
}
