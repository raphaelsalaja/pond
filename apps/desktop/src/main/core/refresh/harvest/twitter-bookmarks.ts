/// <reference lib="dom" />

/**
 * In-page Twitter bookmarks-list harvester. Drives the hidden scrape
 * window through the *list* view (`https://x.com/i/bookmarks`), scrolls
 * to load more, and returns a flat array of `{tweetId, url,
 * bookmarkedAt?}` entries.
 *
 * The orchestrator dedupes against the local saves table and feeds new
 * tweet ids back through `harvestUrl()` for the per-tweet harvester
 * (`twitter.ts`) to enrich. We deliberately *don't* try to scrape the
 * full tweet shape from the bookmarks list — Twitter renders trimmed
 * cards there, with collapsed media, so re-running the per-tweet
 * harvester gives us a richer payload than reading two places at once.
 *
 * Auth wall detection: bookmarks redirect to `/i/flow/login` when the
 * user is signed out. We surface that as `auth_required` so the
 * orchestrator can flip `prefs.sync.twitter.lastError = "auth_required"`
 * and stop firing.
 *
 * Increment vs. backfill: when `mode === "incremental"`, the harvester
 * stops scrolling as soon as it sees a tweet id the caller marked as
 * known (`knownIds`). When `mode === "backfill"`, we walk the entire
 * bookmarks list (capped to a hard ceiling so a runaway page doesn't
 * pin the harvester forever).
 *
 * Like `twitter.ts`, this file's `inPage` function is stringified and
 * eval'd inside the BrowserWindow — keep it self-contained, no closure
 * references, no imports.
 */

export interface BookmarksHarvestArgs {
  /** Bookmarks we already have in the local DB; harvester stops the moment it sees one in incremental mode. */
  knownIds: string[];
  mode: "incremental" | "backfill";
  /** Hard ceiling on items collected per run. */
  maxItems: number;
}

export interface BookmarksEntry {
  tweetId: string;
  url: string;
  /** ISO timestamp on the bookmark card, when Twitter exposes it (`<time datetime>`). */
  bookmarkedAt?: string;
}

export type BookmarksHarvestResult =
  | { ok: true; entries: BookmarksEntry[]; reachedEnd: boolean }
  | { ok: false; reason: "auth_required" | "no_match" | "timeout" };

/**
 * Build a self-contained JS expression that the hidden window can
 * `executeJavaScript` to harvest the bookmarks list. Returns a
 * structured `BookmarksHarvestResult` (JSON-serialisable).
 */
export function buildBookmarksExpression(args: BookmarksHarvestArgs): string {
  // Stringify the in-page function. Same pattern as `twitter.ts` —
  // do not touch closure-scoped variables; everything we need is
  // serialised via the args literal below.
  const fnSrc = `(${inPageBookmarks.toString()})`;
  return `(async () => {
    const args = ${JSON.stringify(args)};
    try { return await ${fnSrc}(args); }
    catch (e) { return { ok: false, reason: 'timeout', error: String(e) }; }
  })()`;
}

/**
 * Looks up the bookmarks page, auto-scrolls until either:
 *   - the list reports it has no more items to load,
 *   - we hit a known tweet id (incremental mode), or
 *   - we collect `maxItems` (hard ceiling).
 *
 * Inlined into the page via `executeJavaScript`; no imports allowed.
 */
async function inPageBookmarks(
  args: BookmarksHarvestArgs,
): Promise<BookmarksHarvestResult> {
  // Auth wall: Twitter redirects /i/bookmarks to /i/flow/login when
  // the user isn't signed in. We also catch the "Restricted to logged-in
  // users" empty-state copy as a defensive fallback.
  if (
    location.pathname.startsWith("/i/flow/login") ||
    location.pathname.startsWith("/login") ||
    location.pathname.startsWith("/i/flow/signup")
  ) {
    return { ok: false, reason: "auth_required" };
  }

  function knownSet(): Set<string> {
    return new Set(args.knownIds.map((s) => String(s)));
  }
  const known = knownSet();

  function collect(): BookmarksEntry[] {
    const entries: BookmarksEntry[] = [];
    const seen = new Set<string>();
    const articles = Array.from(
      document.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'),
    );
    for (const article of articles) {
      // First permalink anchor under the article that points at a tweet.
      const link = article.querySelector<HTMLAnchorElement>(
        'a[href*="/status/"]',
      );
      if (!link) continue;
      let tweetId: string | null = null;
      let pathname = "";
      try {
        const u = new URL(link.href, "https://x.com");
        pathname = u.pathname;
        tweetId = pathname.match(/\/status\/(\d+)/)?.[1] ?? null;
      } catch {
        /* unparseable href, skip */
      }
      if (!tweetId || seen.has(tweetId)) continue;
      seen.add(tweetId);
      const time = article.querySelector<HTMLTimeElement>("time[datetime]");
      const dt = time?.getAttribute("datetime") ?? undefined;
      entries.push({
        tweetId,
        url: `https://x.com${pathname}`,
        ...(dt ? { bookmarkedAt: dt } : {}),
      });
    }
    return entries;
  }

  // Wait until the timeline starts hydrating. Twitter mounts the
  // bookmark grid lazily; harvesting at first paint reliably misses
  // the entire first batch.
  const hydrateDeadline = Date.now() + 12_000;
  while (Date.now() < hydrateDeadline) {
    if (
      document.querySelector('article[data-testid="tweet"]') ||
      document.querySelector('[data-testid="emptyState"]')
    ) {
      break;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  const empty = document.querySelector('[data-testid="emptyState"]');
  if (empty && !document.querySelector('article[data-testid="tweet"]')) {
    return { ok: true, entries: [], reachedEnd: true };
  }

  const collected = new Map<string, BookmarksEntry>();
  function ingest(entries: BookmarksEntry[]): {
    sawKnown: boolean;
    full: boolean;
  } {
    let sawKnown = false;
    for (const entry of entries) {
      if (known.has(entry.tweetId)) sawKnown = true;
      if (!collected.has(entry.tweetId)) {
        collected.set(entry.tweetId, entry);
      }
      if (collected.size >= args.maxItems) return { sawKnown, full: true };
    }
    return { sawKnown, full: false };
  }

  // Initial pass.
  ingest(collect());
  if (
    collected.size >= args.maxItems ||
    (args.mode === "incremental" &&
      Array.from(collected.values()).some((e) => known.has(e.tweetId)))
  ) {
    return {
      ok: true,
      entries: Array.from(collected.values()),
      reachedEnd: false,
    };
  }

  // Scroll loop. Twitter's virtualised list keeps a moving window of
  // ~10-15 articles, so we have to read between scrolls; if we waited
  // until the end we'd lose everything that scrolled off the top.
  const scrollDeadline = Date.now() + 60_000;
  let lastScrollHeight = document.documentElement.scrollHeight;
  let stableCount = 0;
  while (Date.now() < scrollDeadline) {
    window.scrollBy({
      top: window.innerHeight * 0.9,
      behavior: "instant" as ScrollBehavior,
    });
    await new Promise((r) => setTimeout(r, 700));
    const { sawKnown, full } = ingest(collect());
    if (full)
      return {
        ok: true,
        entries: Array.from(collected.values()),
        reachedEnd: false,
      };
    if (args.mode === "incremental" && sawKnown) {
      return {
        ok: true,
        entries: Array.from(collected.values()),
        reachedEnd: false,
      };
    }
    const sh = document.documentElement.scrollHeight;
    if (sh === lastScrollHeight) {
      stableCount += 1;
      if (stableCount >= 4) {
        // No fresh content for ~3s — assume we hit the end.
        return {
          ok: true,
          entries: Array.from(collected.values()),
          reachedEnd: true,
        };
      }
    } else {
      stableCount = 0;
      lastScrollHeight = sh;
    }
  }
  return {
    ok: true,
    entries: Array.from(collected.values()),
    reachedEnd: false,
  };
}
