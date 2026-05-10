/// <reference lib="dom" />

/**
 * Twitter bookmarks harvester. Drives the hidden scrape window to
 * `https://x.com/i/bookmarks` and walks the rendered list via DOM
 * scraping, returning every bookmark we see that isn't already in
 * the local library.
 *
 * Single-mode contract: sync's only job is "ensure every bookmark on
 * Twitter is in the library". There is no "incremental vs backfill" —
 * every run walks the full list (capped only by `maxItems` and the
 * scroll deadline). `knownIds` keeps the dedupe set warm so a
 * virtualised re-render doesn't double-emit, but seeing a known id
 * does NOT short-circuit the loop.
 *
 * Defensive returns:
 *   - Auth wall (`/i/flow/login` etc.) → `auth_required`. Caller
 *     marks the source as needing reconnect.
 *   - Hydrate timed out without ever seeing an article → `no_match`.
 *     Almost always means the page never rendered (Twitter served
 *     the "Something went wrong" interstitial we sometimes hit) —
 *     we surface it as a soft retry rather than misreading silence
 *     as "your bookmarks are empty".
 *   - "Try again" interstitial visible → `no_match`, same reasoning.
 *
 * The `inPageBookmarks` body is stringified via `Function.toString()`
 * and `executeJavaScript`'d into the BrowserWindow's main world. Keep
 * it self-contained: no imports, no closure references, no TypeScript
 * features that don't survive `toString()`.
 */

import type { MediaType } from "@pond/schema/db";
import type { BookmarksCapture, RichTweet } from "./twitter-bookmarks-graphql";

export interface BookmarksHarvestArgs {
  /** Bookmark ids already in the local DB; harvester dedupes against these. */
  knownIds: string[];
  /** Hard ceiling on entries returned per run. */
  maxItems: number;
}

/**
 * One scraped bookmark card. Read straight from the rendered DOM by
 * the in-page walker. The harvester in
 * [`scrape-window.ts`](apps/desktop/src/main/core/refresh/scrape-window.ts)
 * may attach `rich` after parsing the captured GraphQL responses; the
 * DOM walker itself never sets it.
 */
export interface BookmarksEntry {
  tweetId: string;
  url: string;
  /** ISO timestamp on the bookmark card (`<time datetime>`), when present. */
  bookmarkedAt?: string;
  /** First line of the tweet text, capped — used as the save title. */
  title?: string;
  /** Full tweet text snippet from the rendered card. */
  description?: string;
  /** Author handle in `@name` form. */
  author?: string;
  /** First media cover URL, when the card has any media. */
  mediaUrl?: string;
  /** Every media item rendered on the card. First entry is the cover. */
  mediaUrls?: Array<{
    url: string;
    type?: MediaType;
    poster?: string;
  }>;
  /**
   * Rich GraphQL payload, attached post-merge in scrape-window when
   * the preload's XHR hook captured this tweet's `Bookmarks` response.
   * Carries full text, full-quality media, engagement metrics, and
   * any quoted tweet. Never set by the in-page DOM walker.
   */
  rich?: RichTweet;
}

/**
 * Debug telemetry emitted by the in-page walker for runtime diagnosis.
 * Written from the page world; logged from the main process.
 */
export interface BookmarksHarvestDebug {
  hydrateSawArticle: boolean;
  hydrateMs: number;
  scrollIterations: number;
  finalArticleCount: number;
  finalSeenSize: number;
  finalCapturesLength: number;
  hookInstalled: boolean;
  scrollerKind: "document" | "scrollable-div" | "none";
  exitReason:
    | "auth_required"
    | "no_match"
    | "empty_state"
    | "max_items"
    | "stable"
    | "deadline";
  /** Snapshot taken when we hit the empty-state / no-match branch. */
  pageSnapshot?: {
    href: string;
    pathname: string;
    /** First 200 chars of textContent of the `[data-testid="emptyState"]` we matched. */
    emptyStateText: string | null;
    /** Where in the DOM tree the matched element lives (testid path). */
    emptyStateAncestry: string | null;
    /** Did the page have a primary column at all? */
    hasPrimaryColumn: boolean;
    /** Visible "Sign in" / "Log in" button — strong logged-out signal. */
    hasLoginAffordance: boolean;
    /** Article count after we decided to bail. */
    articleCountAfterBail: number;
    /** All `data-testid` values on the page that contain "empty" (case-insensitive). */
    emptyTestIds: string[];
  };
}

export type BookmarksHarvestResult =
  | {
      ok: true;
      entries: BookmarksEntry[];
      /** Raw GraphQL response bodies captured by the preload XHR hook. */
      captures: BookmarksCapture[];
      reachedEnd: boolean;
      debug?: BookmarksHarvestDebug;
    }
  | {
      ok: false;
      reason: "auth_required" | "no_match" | "timeout";
      debug?: BookmarksHarvestDebug;
    };

// 5-minute hard ceiling on a single run. Twitter virtualises the
// bookmarks list, so memory stays bounded; the cap is a safety belt
// against a hung page pinning the harvester forever.
const SCROLL_DEADLINE_MS = 5 * 60_000;

/**
 * Build a self-contained JS expression for `executeJavaScript`.
 * Returns a `BookmarksHarvestResult` (JSON-serialisable).
 */
export function buildBookmarksExpression(args: BookmarksHarvestArgs): string {
  const fnSrc = `(${inPageBookmarks.toString()})`;
  const enriched = { ...args, scrollDeadlineMs: SCROLL_DEADLINE_MS };
  return `(async () => {
    const args = ${JSON.stringify(enriched)};
    try { return await ${fnSrc}(args); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

/**
 * Inlined into the page via `executeJavaScript`. Walks every
 * `article[data-testid="tweet"]` rendered on `/i/bookmarks` as we
 * scroll, extracts the tweet payload directly from the card markup,
 * and returns when the DOM stops growing OR we hit `maxItems` OR the
 * scroll deadline expires.
 */
async function inPageBookmarks(
  args: BookmarksHarvestArgs & { scrollDeadlineMs: number },
): Promise<BookmarksHarvestResult> {
  if (
    location.pathname.startsWith("/i/flow/login") ||
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/i/flow/signup")
  ) {
    return {
      ok: false,
      reason: "auth_required",
      debug: {
        hydrateSawArticle: false,
        hydrateMs: 0,
        scrollIterations: 0,
        finalArticleCount: 0,
        finalSeenSize: 0,
        finalCapturesLength: 0,
        hookInstalled: !!(
          globalThis as unknown as { __pondBookmarksHookInstalled?: boolean }
        ).__pondBookmarksHookInstalled,
        scrollerKind: "none",
        exitReason: "auth_required",
      },
    };
  }

  const known = new Set(args.knownIds.map((s) => String(s)));
  const seen = new Map<string, BookmarksEntry>();
  const captures: BookmarksCapture[] = [];

  const debug: BookmarksHarvestDebug = {
    hydrateSawArticle: false,
    hydrateMs: 0,
    scrollIterations: 0,
    finalArticleCount: 0,
    finalSeenSize: 0,
    finalCapturesLength: 0,
    hookInstalled: !!(
      globalThis as unknown as { __pondBookmarksHookInstalled?: boolean }
    ).__pondBookmarksHookInstalled,
    scrollerKind: "none",
    exitReason: "deadline",
  };

  // Pull anything the preload's XHR hook has buffered since the last
  // tick. The preload writes to `globalThis.__pondBookmarksCaptures`;
  // we splice it down to zero each time so memory doesn't grow with
  // run length on big libraries.
  const drainCaptures = (): void => {
    const buf = (
      globalThis as unknown as {
        __pondBookmarksCaptures?: BookmarksCapture[];
      }
    ).__pondBookmarksCaptures;
    if (!Array.isArray(buf) || buf.length === 0) return;
    for (const item of buf.splice(0)) captures.push(item);
  };

  // Live progress sink. The main process polls
  // `globalThis.__pondHarvestStats` from a separate executeJavaScript
  // call to drive the toast and confirm the in-page loop is still
  // making forward progress. Mutating the same object in-place keeps
  // GC quiet across thousands of iterations on a big library.
  const stats: {
    seen: number;
    fresh: number;
    articles: number;
    captures: number;
    scrolls: number;
    phase: "hydrate" | "scroll" | "done";
    updatedAt: number;
  } = {
    seen: 0,
    fresh: 0,
    articles: 0,
    captures: 0,
    scrolls: 0,
    phase: "hydrate",
    updatedAt: Date.now(),
  };
  (
    globalThis as unknown as { __pondHarvestStats?: typeof stats }
  ).__pondHarvestStats = stats;
  const publishStats = (phase: "hydrate" | "scroll" | "done"): void => {
    stats.seen = seen.size;
    let fresh = 0;
    for (const id of seen.keys()) if (!known.has(id)) fresh += 1;
    stats.fresh = fresh;
    stats.articles = document.querySelectorAll(
      'article[data-testid="tweet"]',
    ).length;
    stats.captures = captures.length;
    stats.phase = phase;
    stats.updatedAt = Date.now();
  };

  const finalize = () => {
    debug.finalArticleCount = document.querySelectorAll(
      'article[data-testid="tweet"]',
    ).length;
    debug.finalSeenSize = seen.size;
    debug.finalCapturesLength = captures.length;
  };

  const TITLE_CAP = 90;
  const DESCRIPTION_CAP = 4000;

  const extract = (article: HTMLElement): BookmarksEntry | null => {
    const link = article.querySelector<HTMLAnchorElement>(
      'a[href*="/status/"]',
    );
    if (!link) return null;
    let tweetId: string | null = null;
    let pathname = "";
    try {
      const u = new URL(link.href, "https://x.com");
      pathname = u.pathname;
      tweetId = pathname.match(/\/status\/(\d+)/)?.[1] ?? null;
    } catch {
      return null;
    }
    if (!tweetId) return null;

    const time = article.querySelector<HTMLTimeElement>("time[datetime]");
    const bookmarkedAt = time?.getAttribute("datetime") ?? undefined;

    // The author block lives at `[data-testid="User-Name"]`. The
    // handle is usually the second link inside it (`@name`); the
    // first is the display-name link.
    const handleLink = Array.from(
      article.querySelectorAll<HTMLAnchorElement>(
        '[data-testid="User-Name"] a[href^="/"]',
      ),
    ).find((a) => {
      const text = a.textContent?.trim() ?? "";
      return text.startsWith("@");
    });
    const author = handleLink?.textContent?.trim() ?? undefined;

    // Tweet body. Twitter sometimes splits the text across multiple
    // `[data-testid="tweetText"]` blocks (e.g. when there's an
    // attached card link); join them.
    const textBlocks = Array.from(
      article.querySelectorAll<HTMLElement>('[data-testid="tweetText"]'),
    );
    const fullText = textBlocks
      .map((el) => (el.textContent ?? "").trim())
      .filter(Boolean)
      .join("\n\n");
    const description =
      fullText.length > DESCRIPTION_CAP
        ? `${fullText.slice(0, DESCRIPTION_CAP)}…`
        : fullText || undefined;
    const firstLine = fullText.split(/\n+/)[0]?.trim() ?? "";
    const title =
      firstLine.length === 0
        ? undefined
        : firstLine.length <= TITLE_CAP
          ? firstLine
          : `${firstLine.slice(0, TITLE_CAP - 1).trimEnd()}…`;

    // Media: photos live under `[data-testid="tweetPhoto"]`; videos
    // expose a `<video>` whose `poster` is the cover image.
    const mediaUrls: NonNullable<BookmarksEntry["mediaUrls"]> = [];
    const photoNodes = Array.from(
      article.querySelectorAll<HTMLElement>('[data-testid="tweetPhoto"]'),
    );
    const seenMedia = new Set<string>();
    for (const node of photoNodes) {
      const video = node.querySelector<HTMLVideoElement>("video");
      const img = node.querySelector<HTMLImageElement>("img");
      if (video?.poster) {
        const upgraded = upgradeTwimgUrl(video.poster);
        if (!seenMedia.has(upgraded)) {
          seenMedia.add(upgraded);
          mediaUrls.push({ url: upgraded, type: "video", poster: upgraded });
        }
      } else if (img?.src) {
        const upgraded = upgradeTwimgUrl(img.src);
        if (!seenMedia.has(upgraded)) {
          seenMedia.add(upgraded);
          mediaUrls.push({ url: upgraded, type: "image" });
        }
      }
    }

    const entry: BookmarksEntry = {
      tweetId,
      url: `https://x.com${pathname}`,
    };
    if (bookmarkedAt) entry.bookmarkedAt = bookmarkedAt;
    if (title) entry.title = title;
    if (description) entry.description = description;
    if (author) entry.author = author;
    if (mediaUrls.length > 0) {
      entry.mediaUrls = mediaUrls;
      entry.mediaUrl = mediaUrls[0]?.url;
    }
    return entry;
  };

  const upgradeTwimgUrl = (url: string): string => {
    try {
      const u = new URL(url);
      if (u.hostname === "pbs.twimg.com") {
        u.searchParams.set("name", "orig");
        return u.toString();
      }
    } catch {
      /* fall through */
    }
    return url;
  };

  const collect = (): boolean => {
    let added = false;
    const articles = Array.from(
      document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'),
    );
    for (const article of articles) {
      const entry = extract(article);
      if (!entry) continue;
      if (seen.has(entry.tweetId)) continue;
      seen.set(entry.tweetId, entry);
      added = true;
    }
    return added;
  };

  const newCount = (): number => {
    let n = 0;
    for (const id of seen.keys()) {
      if (!known.has(id)) n += 1;
    }
    return n;
  };

  const freshEntries = (): BookmarksEntry[] => {
    const out: BookmarksEntry[] = [];
    for (const [id, entry] of seen) {
      if (known.has(id)) continue;
      out.push(entry);
    }
    return out;
  };

  // Twitter renders `<div data-testid="emptyState">Bookmark posts to
  // save them for later…</div>` as a *transient placeholder* while
  // the `Bookmarks` GraphQL query is in flight (typically 1.5–3s).
  // If we exit the hydrate loop the moment we see `emptyState`, we
  // race the network and bail before a single article paints — which
  // is exactly what the runtime logs showed. So the loop only exits
  // early on a real `article`. An `emptyState` is only ground truth
  // once we ALSO have a captured Bookmarks response (which the XHR
  // hook in the preload buffers on `__pondBookmarksCaptures`); that
  // means Twitter's GraphQL has actually returned and the user
  // genuinely has zero bookmarks.
  let sawArticle = false;
  const hydrateStart = Date.now();
  const hydrateDeadline = hydrateStart + 20_000;
  const peekCapturesLen = (): number => {
    const buf = (
      globalThis as unknown as {
        __pondBookmarksCaptures?: BookmarksCapture[];
      }
    ).__pondBookmarksCaptures;
    return Array.isArray(buf) ? buf.length : 0;
  };
  while (Date.now() < hydrateDeadline) {
    if (document.querySelector('article[data-testid="tweet"]')) {
      sawArticle = true;
      break;
    }
    if (
      document.querySelector('[data-testid="emptyState"]') &&
      peekCapturesLen() > 0
    ) {
      break;
    }
    publishStats("hydrate");
    await new Promise((r) => setTimeout(r, 250));
  }
  debug.hydrateSawArticle = sawArticle;
  debug.hydrateMs = Date.now() - hydrateStart;

  // No articles AND no empty-state element after 12s → page never
  // rendered. Most likely Twitter served the "Something went wrong"
  // interstitial. Don't claim "reached end of empty list" — surface
  // as a soft no-match so the orchestrator retries on the next tick
  // without touching `lastSyncedAt`.
  if (!sawArticle) {
    const empty = document.querySelector('[data-testid="emptyState"]');
    const buildAncestry = (el: Element | null): string => {
      if (!el) return "";
      const parts: string[] = [];
      let cur: Element | null = el;
      let depth = 0;
      while (cur && depth < 12) {
        const tid = cur.getAttribute("data-testid");
        const tag = cur.tagName.toLowerCase();
        parts.unshift(tid ? `${tag}[${tid}]` : tag);
        cur = cur.parentElement;
        depth += 1;
      }
      return parts.join(" > ");
    };
    const collectEmptyTestIds = (): string[] => {
      const out = new Set<string>();
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>("[data-testid]"),
      )) {
        const v = el.getAttribute("data-testid") ?? "";
        if (/empty/i.test(v)) out.add(v);
      }
      return Array.from(out);
    };
    const detectLoginAffordance = (): boolean => {
      for (const el of Array.from(
        document.querySelectorAll<HTMLElement>(
          'a[href="/login"], a[href*="/i/flow/login"], [data-testid="loginButton"]',
        ),
      )) {
        if (el.offsetParent !== null) return true;
      }
      return false;
    };
    debug.pageSnapshot = {
      href: location.href,
      pathname: location.pathname,
      emptyStateText: empty
        ? (empty.textContent ?? "").trim().slice(0, 200)
        : null,
      emptyStateAncestry: empty ? buildAncestry(empty) : null,
      hasPrimaryColumn: !!document.querySelector(
        '[data-testid="primaryColumn"]',
      ),
      hasLoginAffordance: detectLoginAffordance(),
      articleCountAfterBail: document.querySelectorAll(
        'article[data-testid="tweet"]',
      ).length,
      emptyTestIds: collectEmptyTestIds(),
    };
    if (empty) {
      drainCaptures();
      debug.exitReason = "empty_state";
      finalize();
      return { ok: true, entries: [], captures, reachedEnd: true, debug };
    }
    debug.exitReason = "no_match";
    finalize();
    return { ok: false, reason: "no_match", debug };
  }

  // Twitter's "Try again" interstitial when the SPA chokes on a
  // request. Same treatment as the no-render case above.
  const looksLikeRetryWall = (): boolean => {
    if (document.querySelector('[data-testid="error-detail"]')) return true;
    const buttons = Array.from(document.querySelectorAll("button, a"));
    return buttons.some((b) =>
      (b.textContent ?? "").trim().toLowerCase().startsWith("try again"),
    );
  };
  if (looksLikeRetryWall() && seen.size === 0) {
    debug.exitReason = "no_match";
    finalize();
    return { ok: false, reason: "no_match", debug };
  }

  collect();
  drainCaptures();
  publishStats("scroll");
  if (newCount() >= args.maxItems) {
    debug.exitReason = "max_items";
    finalize();
    return {
      ok: true,
      entries: freshEntries(),
      captures,
      reachedEnd: false,
      debug,
    };
  }

  // Detect which element is actually the scroll container. If we end
  // up here scrolling the document body, but Twitter has a virtualised
  // inner container, `window.scrollBy` is a no-op and the page never
  // paginates past the initial viewport. Pick the largest scrollable
  // descendant of <main> that has overflow-y auto/scroll AND a
  // scrollHeight > clientHeight.
  const findScroller = (): {
    el: HTMLElement | null;
    kind: BookmarksHarvestDebug["scrollerKind"];
  } => {
    const docCanScroll =
      document.scrollingElement &&
      (document.scrollingElement as HTMLElement).scrollHeight >
        (document.scrollingElement as HTMLElement).clientHeight;
    const main = document.querySelector("main") ?? document.body;
    const candidates = Array.from(
      main.querySelectorAll<HTMLElement>("*"),
    ).filter((el) => {
      if (el.scrollHeight <= el.clientHeight) return false;
      const cs = getComputedStyle(el);
      return cs.overflowY === "auto" || cs.overflowY === "scroll";
    });
    candidates.sort((a, b) => b.scrollHeight - a.scrollHeight);
    const inner = candidates[0] ?? null;
    if (inner) return { el: inner, kind: "scrollable-div" };
    if (docCanScroll) return { el: null, kind: "document" };
    return { el: null, kind: "none" };
  };
  const scroller = findScroller();
  debug.scrollerKind = scroller.kind;

  const scrollDeadline = Date.now() + args.scrollDeadlineMs;
  let lastSize = seen.size;
  let stableTicks = 0;
  while (Date.now() < scrollDeadline) {
    if (scroller.el) {
      scroller.el.scrollBy({
        top: scroller.el.clientHeight * 0.9,
        behavior: "instant" as ScrollBehavior,
      });
    } else {
      window.scrollBy({
        top: window.innerHeight * 0.9,
        behavior: "instant" as ScrollBehavior,
      });
    }
    // 700ms ± 300 — jittered so the scroll cadence doesn't look
    // like a bot pinning Twitter's pagination endpoint.
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 300));
    debug.scrollIterations += 1;
    stats.scrolls += 1;

    collect();
    drainCaptures();
    publishStats("scroll");
    if (newCount() >= args.maxItems) {
      debug.exitReason = "max_items";
      finalize();
      return {
        ok: true,
        entries: freshEntries(),
        captures,
        reachedEnd: false,
        debug,
      };
    }

    if (seen.size === lastSize) {
      stableTicks += 1;
      // ~3.5s of no DOM growth means Twitter has nothing more to load.
      if (stableTicks >= 5) {
        // One last drain in case the final scroll provoked a request
        // whose `load` event fired between our last drain and now.
        drainCaptures();
        debug.exitReason = "stable";
        finalize();
        return {
          ok: true,
          entries: freshEntries(),
          captures,
          reachedEnd: true,
          debug,
        };
      }
    } else {
      stableTicks = 0;
      lastSize = seen.size;
    }
  }

  drainCaptures();
  debug.exitReason = "deadline";
  finalize();
  return {
    ok: true,
    entries: freshEntries(),
    captures,
    reachedEnd: false,
    debug,
  };
}
