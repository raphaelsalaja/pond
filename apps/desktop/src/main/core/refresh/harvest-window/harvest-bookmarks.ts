import { MEDIA_TYPES } from "@pond/schema/db";
import type { JsonValue } from "@pond/schema/json";
import log from "electron-log/main.js";
import { z } from "zod";
import { markAtRisk, report } from "../../pipeline/rate-governor";
import {
  type BookmarksEntry,
  type BookmarksHarvestArgs,
  type BookmarksHarvestResult,
  buildBookmarkFolderApiExpression,
  buildBookmarksApiExpression,
  buildBookmarksExpression,
  buildLikesApiExpression,
  parseBookmarksResponses,
  twitterBookmarkFolderUrl,
} from "../harvest/twitter";
import { NAV_TIMEOUT_MS } from "./constants";
import {
  looksLikeAuthWall,
  looksLikeChallenge,
  navigateWithTimeout,
} from "./navigation";
import { leaseWindow } from "./pool";
import { sleep } from "./util";

interface BookmarksHarvestProgress {
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

const BookmarksStatsSchema = z
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

const BookmarksEntrySchema = z
  .object({
    tweetId: z.string(),
    url: z.string(),
    bookmarkedAt: OptionalText,
    title: OptionalText,
    description: OptionalText,
    author: OptionalText,
    mediaUrl: OptionalText,
    mediaUrls: z
      .array(
        z.object({
          url: z.string(),
          type: z.enum(MEDIA_TYPES).optional().catch(undefined),
          poster: OptionalText,
        }),
      )
      .optional()
      .catch(undefined),
  })
  .nullable()
  .catch(null);

const BookmarksCaptureSchema = z
  .object({ url: z.string(), body: z.string(), status: OptionalCount })
  .nullable()
  .catch(null);

const HarvestedPageSchema = z.object({
  ok: z.literal(true),
  entries: z.array(BookmarksEntrySchema).catch([]),
  captures: z.array(BookmarksCaptureSchema).catch([]),
  reachedEnd: z.boolean().catch(false),
});

const BookmarksApiResultSchema = z
  .union([
    HarvestedPageSchema.extend({
      apiDebug: z
        .object({
          pages: OptionalCount,
          tweets: OptionalCount,
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

const BookmarksScrollResultSchema = z
  .union([
    HarvestedPageSchema,
    z.object({
      ok: z.literal(false),
      reason: z
        .enum(["auth_required", "no_match", "timeout", "rate_limited"])
        .catch("no_match"),
      retryAfterSec: OptionalCount,
    }),
  ])
  .nullable()
  .catch(null);

function readStats(raw: string): z.infer<typeof BookmarksStatsSchema> {
  try {
    return BookmarksStatsSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function harvestTwitterBookmarks(
  args: BookmarksHarvestArgs,
  opts: {
    onProgress?: (p: BookmarksHarvestProgress) => void;
    partition?: string;
  } = {},
): Promise<BookmarksHarvestResult> {
  return harvestTwitterTimeline(
    "https://x.com/i/bookmarks",
    "bookmarks",
    buildBookmarksApiExpression(args),
    args,
    opts,
  );
}

export async function harvestTwitterBookmarkFolder(
  folderId: string,
  args: BookmarksHarvestArgs,
  opts: {
    onProgress?: (p: BookmarksHarvestProgress) => void;
    partition?: string;
  } = {},
): Promise<BookmarksHarvestResult> {
  return harvestTwitterTimeline(
    twitterBookmarkFolderUrl(folderId),
    "bookmarks",
    buildBookmarkFolderApiExpression(args),
    args,
    opts,
  );
}

export async function harvestTwitterLikes(
  args: BookmarksHarvestArgs,
  opts: {
    onProgress?: (p: BookmarksHarvestProgress) => void;
    partition?: string;
    handle: string;
  },
): Promise<BookmarksHarvestResult> {
  const handle = opts.handle.replace(/^@/, "").trim();
  if (!handle) return { ok: false, reason: "no_match" };
  return harvestTwitterTimeline(
    `https://x.com/${encodeURIComponent(handle)}/likes`,
    "likes",
    buildLikesApiExpression(args),
    args,
    opts,
  );
}

async function harvestTwitterTimeline(
  listUrl: string,
  logTag: "bookmarks" | "likes",
  apiExpr: string,
  args: BookmarksHarvestArgs,
  opts: {
    onProgress?: (p: BookmarksHarvestProgress) => void;
    partition?: string;
  } = {},
): Promise<BookmarksHarvestResult> {
  const lease = await leaseWindow("twitter", { partition: opts.partition });
  try {
    const navOk = await navigateWithTimeout(lease.win, listUrl, NAV_TIMEOUT_MS);
    if (!navOk) return { ok: false, reason: "timeout" };
    const bookmarksUrl = lease.win.webContents.getURL();
    const bookmarksChallenge = looksLikeChallenge(bookmarksUrl);
    if (bookmarksChallenge) {
      markAtRisk(
        "twitter",
        bookmarksChallenge.kind,
        `${logTag} harvest landed on ${bookmarksChallenge.kind}`,
      );
      return { ok: false, reason: "auth_required" };
    }
    if (looksLikeAuthWall(bookmarksUrl)) {
      return { ok: false, reason: "auth_required" };
    }

    let lastSeen = -1;
    let lastPhase: BookmarksHarvestProgress["phase"] | null = null;
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
        sleep(6 * 60_000).then(() => "__pond_bookmarks_timeout__"),
      ]);

    let result: Extract<BookmarksHarvestResult, { ok: true }>;
    try {
      const apiRaw = await runExpr(apiExpr);
      if (apiRaw === "__pond_bookmarks_timeout__") {
        log.warn(`[pond ${logTag}] api harvest timed out; falling back`);
      }
      const api = BookmarksApiResultSchema.parse(apiRaw);

      if (api?.ok) {
        log.info(
          `[pond ${logTag}] api ok pages=${api.apiDebug?.pages ?? "?"} tweets=${api.apiDebug?.tweets ?? "?"} reason=${api.apiDebug?.reason ?? "?"}`,
        );
        report("twitter", { ok: true });
        result = {
          ok: true,
          entries: api.entries.flatMap((e) => (e ? [e] : [])),
          captures: api.captures.flatMap((c) => (c ? [c] : [])),
          reachedEnd: api.reachedEnd,
        };
      } else if (api && api.reason === "auth_required") {
        return { ok: false, reason: "auth_required" };
      } else if (api && api.reason === "rate_limited") {
        const { cooldownMs } = report("twitter", {
          ok: false,
          rateLimited: true,
          retryAfterSec: api.retryAfterSec ?? undefined,
        });
        log.warn(
          `[pond ${logTag}] rate limited; backing off ${Math.round(cooldownMs / 1000)}s (no scroll fallback)`,
        );
        return {
          ok: false,
          reason: "rate_limited",
          retryAfterSec: api.retryAfterSec ?? undefined,
        };
      } else {
        log.info(
          `[pond ${logTag}] api fallback (${api && "detail" in api ? api.detail : "timeout"}); scrolling`,
        );
        const scrollRaw = await runExpr(buildBookmarksExpression(args));
        if (scrollRaw === "__pond_bookmarks_timeout__") {
          log.warn(`[pond ${logTag}] harvest timed out`);
          return { ok: false, reason: "timeout" };
        }
        const scroll = BookmarksScrollResultSchema.parse(scrollRaw);
        if (!scroll) {
          return { ok: false, reason: "no_match" };
        }
        if (!scroll.ok) return scroll;
        result = {
          ok: true,
          entries: scroll.entries.flatMap((e) => (e ? [e] : [])),
          captures: scroll.captures.flatMap((c) => (c ? [c] : [])),
          reachedEnd: scroll.reachedEnd,
        };
      }
    } finally {
      stopPolling = true;
      clearInterval(pollInterval);
    }

    const rich = parseBookmarksResponses(result.captures);
    const seenTweetIds = new Set<string>();
    const merged: BookmarksEntry[] = [];
    for (const entry of result.entries) {
      if (seenTweetIds.has(entry.tweetId)) continue;
      seenTweetIds.add(entry.tweetId);
      const r = rich.get(entry.tweetId);
      if (!r) {
        merged.push(entry);
        continue;
      }
      const firstLine = r.fullText.split(/\n+/)[0]?.trim() ?? "";
      const richTitle =
        firstLine.length === 0
          ? entry.title
          : firstLine.length <= 90
            ? firstLine
            : `${firstLine.slice(0, 89).trimEnd()}…`;
      merged.push({
        ...entry,
        title: richTitle ?? entry.title,
        description: r.fullText || entry.description,
        author: r.author.handle ? `@${r.author.handle}` : entry.author,
        mediaUrls: r.media.length > 0 ? r.media : entry.mediaUrls,
        mediaUrl: r.media[0]?.url ?? entry.mediaUrl,
        rich: r,
      });
    }
    for (const [tweetId, r] of rich) {
      if (seenTweetIds.has(tweetId)) continue;
      seenTweetIds.add(tweetId);
      const firstLine = r.fullText.split(/\n+/)[0]?.trim() ?? "";
      const richTitle =
        firstLine.length === 0
          ? undefined
          : firstLine.length <= 90
            ? firstLine
            : `${firstLine.slice(0, 89).trimEnd()}…`;
      const richMediaUrls = r.media.length > 0 ? r.media : undefined;
      const entry: BookmarksEntry = { tweetId, url: r.url, rich: r };
      if (r.bookmarkedAt) entry.bookmarkedAt = r.bookmarkedAt;
      if (richTitle) entry.title = richTitle;
      if (r.fullText) entry.description = r.fullText;
      if (r.author.handle) entry.author = `@${r.author.handle}`;
      if (richMediaUrls) entry.mediaUrls = richMediaUrls;
      if (r.media[0]?.url) entry.mediaUrl = r.media[0].url;
      merged.push(entry);
    }
    log.info(
      `[pond ${logTag}] DOM=${result.entries.length} rich=${rich.size} merged=${merged.length} captures=${result.captures.length}`,
    );
    return {
      ok: true,
      entries: merged,
      captures: result.captures,
      reachedEnd: result.reachedEnd,
    };
  } catch (err) {
    log.warn(`[pond ${logTag}] unexpected error`, err);
    return { ok: false, reason: "timeout" };
  } finally {
    lease.release();
  }
}
