import { setTimeout as sleep } from "node:timers/promises";
import { MEDIA_TYPES } from "@pond/schema/db";
import type { JsonValue } from "@pond/schema/json";
import type { BrowserWindow } from "electron";
import log from "electron-log/main.js";
import { z } from "zod";
import { markAtRisk, report } from "../../pipeline/rate-governor";
import { pickTitle } from "../harvest/lib/title";
import { buildSavedApiExpression } from "../harvest/threads/api";
import { parseSavedResponses } from "../harvest/threads/graphql";
import {
  buildThreadsListExpression,
  THREADS_LIST_PAGES,
  type ThreadsListKind,
} from "../harvest/threads/list";
import type {
  SavedEntry,
  SavedHarvestArgs,
  SavedHarvestResult,
} from "../harvest/threads/saved-types";
import { NAV_TIMEOUT_MS } from "./constants";
import {
  looksLikeAuthWall,
  looksLikeChallenge,
  navigateWithTimeout,
} from "./navigation";
import { leaseWindow } from "./pool";

interface SavedHarvestProgress {
  phase: "hydrate" | "scroll";
  seen: number;
  fresh: number;
  articles: number;
  captures: number;
  scrolls: number;
}

const OptionalText = z.string().optional().catch(undefined);
const OptionalCount = z.number().optional().catch(undefined);
const TextSchema = z.string().catch("");

const SavedStatsSchema = z
  .object({
    phase: z.enum(["hydrate", "scroll", "done"]),
    seen: z.number().catch(0),
    fresh: z.number().catch(0),
    articles: z.number().catch(0),
    captures: z.number().catch(0),
    scrolls: z.number().catch(0),
  })
  .nullable()
  .catch(null);

const SavedCaptureSchema = z
  .object({ url: z.string(), body: z.string(), status: OptionalCount })
  .nullable()
  .catch(null);

const MediaUrlsSchema = z
  .array(
    z.object({
      url: z.string(),
      type: z.enum(MEDIA_TYPES).optional().catch(undefined),
      poster: OptionalText,
    }),
  )
  .optional()
  .catch(undefined);

const SavedEntrySchema = z
  .object({
    postId: z.string(),
    url: z.string(),
    title: OptionalText,
    description: OptionalText,
    author: OptionalText,
    mediaUrl: OptionalText,
    mediaUrls: MediaUrlsSchema,
  })
  .nullable()
  .catch(null);

const SavedApiResultSchema = z
  .union([
    z.object({
      ok: z.literal(true),
      entries: z.array(SavedEntrySchema).catch([]),
      captures: z.array(SavedCaptureSchema).catch([]),
      reachedEnd: z.boolean().catch(false),
      apiDebug: z
        .object({
          pages: OptionalCount,
          posts: OptionalCount,
          reason: OptionalText,
        })
        .optional()
        .catch(undefined),
    }),
    z.object({
      ok: z.literal(false),
      reason: z
        .enum(["auth_required", "rate_limited", "fallback"])
        .catch("fallback"),
      retryAfterSec: z.number().nullable().optional().catch(null),
      detail: OptionalText,
    }),
  ])
  .nullable()
  .catch(null);

const ScrollResultSchema = z
  .object({
    ok: z.boolean().optional().catch(undefined),
    reason: z
      .enum(["auth_required", "no_match", "timeout", "rate_limited"])
      .optional()
      .catch(undefined),
    entries: z
      .array(
        z
          .object({
            sourceId: z.string(),
            url: z.string(),
            title: OptionalText,
            description: OptionalText,
            author: OptionalText,
            mediaUrl: OptionalText,
            mediaUrls: MediaUrlsSchema,
          })
          .nullable()
          .catch(null),
      )
      .catch([]),
    reachedEnd: z.boolean().optional().catch(undefined),
  })
  .nullable()
  .catch(null);

function readStats(raw: string): z.infer<typeof SavedStatsSchema> {
  try {
    return SavedStatsSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function harvestThreadsList(
  kind: ThreadsListKind,
  args: SavedHarvestArgs,
  opts: {
    onProgress?: (p: SavedHarvestProgress) => void;
    partition?: string;
  } = {},
): Promise<SavedHarvestResult> {
  let last: SavedHarvestResult = { ok: false, reason: "no_match" };
  for (const url of THREADS_LIST_PAGES[kind]) {
    last = await harvestThreadsFeed(url, args, opts);
    if (
      last.ok ||
      last.reason === "auth_required" ||
      last.reason === "rate_limited"
    ) {
      return last;
    }
  }
  return last;
}

async function harvestThreadsFeed(
  listUrl: string,
  args: SavedHarvestArgs,
  opts: {
    onProgress?: (p: SavedHarvestProgress) => void;
    partition?: string;
  } = {},
): Promise<SavedHarvestResult> {
  const lease = await leaseWindow("threads", { partition: opts.partition });
  try {
    const navOk = await navigateWithTimeout(lease.win, listUrl, NAV_TIMEOUT_MS);
    if (!navOk) return { ok: false, reason: "timeout" };
    const savedUrl = lease.win.webContents.getURL();
    const challenge = looksLikeChallenge(savedUrl);
    if (challenge) {
      markAtRisk(
        "threads",
        challenge.kind,
        `saved harvest landed on ${challenge.kind}`,
      );
      return { ok: false, reason: "auth_required" };
    }
    if (looksLikeAuthWall(savedUrl)) {
      return { ok: false, reason: "auth_required" };
    }

    try {
      await lease.win.webContents.executeJavaScript(
        "globalThis.__pondThreadsSavedRequest=null;globalThis.__pondThreadsSavedCaptures=[];",
        true,
      );
    } catch {
      /* hook may not be installed yet */
    }

    let lastSeen = -1;
    let lastPhase: SavedHarvestProgress["phase"] | null = null;
    let stopPolling = false;
    const pollInterval = setInterval(() => {
      if (stopPolling) return;
      if (lease.win.isDestroyed()) {
        clearInterval(pollInterval);
        return;
      }
      void lease.win.webContents
        .executeJavaScript(
          "JSON.stringify(globalThis.__pondHarvestStats ?? null)",
          true,
        )
        .then((raw) => {
          const stats = readStats(TextSchema.parse(raw));
          if (!stats || stats.phase === "done") return;
          const moved = stats.seen !== lastSeen || stats.phase !== lastPhase;
          if (!moved) return;
          lastSeen = stats.seen;
          lastPhase = stats.phase;
          opts.onProgress?.({
            phase: stats.phase,
            seen: stats.seen,
            fresh: stats.fresh,
            articles: stats.articles,
            captures: stats.captures,
            scrolls: stats.scrolls,
          });
        })
        .catch(() => {});
    }, 1500);

    const runExpr = (expr: string): Promise<JsonValue> =>
      Promise.race([
        lease.win.webContents.executeJavaScript(expr, true),
        sleep(6 * 60_000).then(() => "__pond_saved_timeout__"),
      ]);

    let result: Extract<SavedHarvestResult, { ok: true }>;
    try {
      const apiRaw = await runExpr(buildSavedApiExpression(args));
      if (apiRaw === "__pond_saved_timeout__") {
        log.warn("[pond threads-saved] api harvest timed out; falling back");
      }
      const api = SavedApiResultSchema.parse(apiRaw);

      if (api?.ok) {
        log.info(
          `[pond threads-saved] api ok pages=${api.apiDebug?.pages ?? "?"} posts=${api.apiDebug?.posts ?? "?"} reason=${api.apiDebug?.reason ?? "?"}`,
        );
        report("threads", { ok: true });
        result = {
          ok: true,
          entries: api.entries.flatMap((e) => (e ? [e] : [])),
          captures: api.captures.flatMap((c) => (c ? [c] : [])),
          reachedEnd: api.reachedEnd,
        };
      } else if (api && api.reason === "auth_required") {
        return { ok: false, reason: "auth_required" };
      } else if (api && api.reason === "rate_limited") {
        const { cooldownMs } = report("threads", {
          ok: false,
          rateLimited: true,
          retryAfterSec: api.retryAfterSec ?? undefined,
        });
        log.warn(
          `[pond threads-saved] rate limited; backing off ${Math.round(cooldownMs / 1000)}s (no scroll fallback)`,
        );
        return {
          ok: false,
          reason: "rate_limited",
          retryAfterSec: api.retryAfterSec ?? undefined,
        };
      } else {
        log.info(
          `[pond threads-saved] api fallback (${api && "detail" in api ? api.detail : "timeout"}); scrolling`,
        );
        const scrollRaw = await runExpr(buildThreadsListExpression(args));
        if (scrollRaw === "__pond_saved_timeout__") {
          log.warn("[pond threads-saved] harvest timed out");
          return { ok: false, reason: "timeout" };
        }
        const scroll = ScrollResultSchema.parse(scrollRaw);
        if (!scroll) {
          return { ok: false, reason: "no_match" };
        }
        if (!scroll.ok) {
          return { ok: false, reason: scroll.reason ?? "no_match" };
        }
        const hookCaptures = await drainHookCaptures(lease.win);
        result = {
          ok: true,
          entries: scroll.entries.flatMap((e) => {
            if (!e) return [];
            const entry: SavedEntry = { postId: e.sourceId, url: e.url };
            if (e.title) entry.title = e.title;
            if (e.description) entry.description = e.description;
            if (e.author) entry.author = e.author;
            if (e.mediaUrl) entry.mediaUrl = e.mediaUrl;
            if (e.mediaUrls) entry.mediaUrls = e.mediaUrls;
            return [entry];
          }),
          captures: hookCaptures,
          reachedEnd: scroll.reachedEnd === true,
        };
      }
    } finally {
      stopPolling = true;
      clearInterval(pollInterval);
    }

    const rich = parseSavedResponses(result.captures);
    const seenIds = new Set<string>();
    const merged: SavedEntry[] = [];
    for (const entry of result.entries) {
      if (seenIds.has(entry.postId)) continue;
      seenIds.add(entry.postId);
      const r = rich.get(entry.postId);
      if (!r) {
        merged.push(entry);
        continue;
      }
      merged.push(enrichEntry(entry, r));
    }
    for (const [postId, r] of rich) {
      if (seenIds.has(postId)) continue;
      seenIds.add(postId);
      merged.push(enrichEntry({ postId, url: r.url }, r));
    }
    log.info(
      `[pond threads-saved] merged=${merged.length} captures=${result.captures.length}`,
    );
    return {
      ok: true,
      entries: merged,
      captures: result.captures,
      reachedEnd: result.reachedEnd,
    };
  } catch (err) {
    log.warn("[pond threads-saved] unexpected error", err);
    return { ok: false, reason: "timeout" };
  } finally {
    lease.release();
  }
}

function enrichEntry(
  entry: SavedEntry,
  r: NonNullable<SavedEntry["rich"]>,
): SavedEntry {
  const richMediaUrls = r.media.length > 0 ? r.media : entry.mediaUrls;
  return {
    ...entry,
    url: r.url || entry.url,
    title: pickTitle(r.fullText, entry.title) ?? undefined,
    description: r.fullText || entry.description,
    author: r.author.handle ? `@${r.author.handle}` : entry.author,
    mediaUrls: richMediaUrls,
    mediaUrl: r.media[0]?.url ?? entry.mediaUrl,
    rich: r,
  };
}

async function drainHookCaptures(
  win: BrowserWindow,
): Promise<import("../harvest/threads/graphql").SavedCapture[]> {
  try {
    const raw = await win.webContents.executeJavaScript(
      "JSON.stringify(globalThis.__pondThreadsSavedCaptures ?? [])",
      true,
    );
    const rows = z
      .array(SavedCaptureSchema)
      .catch([])
      .parse(JSON.parse(TextSchema.parse(raw)));
    return rows.flatMap((c) => (c ? [c] : []));
  } catch {
    return [];
  }
}
