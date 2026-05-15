/// <reference lib="dom" />

import type { MediaType } from "@pond/schema/db";
import type { BookmarksCapture, RichTweet } from "./graphql";

export interface BookmarksHarvestArgs {
  knownIds: string[];
}

export interface BookmarksEntry {
  tweetId: string;
  url: string;
  bookmarkedAt?: string;
  title?: string;
  description?: string;
  author?: string;
  mediaUrl?: string;
  mediaUrls?: Array<{
    url: string;
    type?: MediaType;
    poster?: string;
  }>;
  rich?: RichTweet;
}

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
    | "stable"
    | "deadline";
  pageSnapshot?: {
    href: string;
    pathname: string;
    emptyStateText: string | null;
    emptyStateAncestry: string | null;
    hasPrimaryColumn: boolean;
    hasLoginAffordance: boolean;
    articleCountAfterBail: number;
    emptyTestIds: string[];
  };
}

export type BookmarksHarvestResult =
  | {
      ok: true;
      entries: BookmarksEntry[];
      captures: BookmarksCapture[];
      reachedEnd: boolean;
      debug?: BookmarksHarvestDebug;
    }
  | {
      ok: false;
      reason: "auth_required" | "no_match" | "timeout";
      debug?: BookmarksHarvestDebug;
    };

const SCROLL_DEADLINE_MS = 5 * 60_000;

export function buildBookmarksExpression(args: BookmarksHarvestArgs): string {
  const fnSrc = `(${inPageBookmarks.toString()})`;
  const enriched = { ...args, scrollDeadlineMs: SCROLL_DEADLINE_MS };
  return `(async () => {
    const args = ${JSON.stringify(enriched)};
    try { return await ${fnSrc}(args); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

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

  const drainCaptures = (): void => {
    const buf = (
      globalThis as unknown as {
        __pondBookmarksCaptures?: BookmarksCapture[];
      }
    ).__pondBookmarksCaptures;
    if (!Array.isArray(buf) || buf.length === 0) return;
    for (const item of buf.splice(0)) captures.push(item);
  };

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

    const handleLink = Array.from(
      article.querySelectorAll<HTMLAnchorElement>(
        '[data-testid="User-Name"] a[href^="/"]',
      ),
    ).find((a) => {
      const text = a.textContent?.trim() ?? "";
      return text.startsWith("@");
    });
    const author = handleLink?.textContent?.trim() ?? undefined;

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

  const freshEntries = (): BookmarksEntry[] => {
    const out: BookmarksEntry[] = [];
    for (const [id, entry] of seen) {
      if (known.has(id)) continue;
      out.push(entry);
    }
    return out;
  };

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
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 300));
    debug.scrollIterations += 1;
    stats.scrolls += 1;

    collect();
    drainCaptures();
    publishStats("scroll");

    if (seen.size === lastSize) {
      stableTicks += 1;
      if (stableTicks >= 5) {
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
