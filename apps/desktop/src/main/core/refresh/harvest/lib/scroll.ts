/// <reference lib="dom" />

/**
 * Reusable scroll scaffold for DOM-based list collectors. Serializable
 * via `.toString()` — each list collector injects it and provides only
 * the source-specific `collectFn` and configuration.
 *
 * Supports two pagination strategies:
 *   - `"scroll"` (default) — scrolls the document and watches for
 *     `scrollHeight` stabilization
 *   - `"click-next"` — clicks a "next" link (e.g. old.reddit pagination)
 */
export function inPageScrollCollect() {
  return async function scrollCollect<
    T extends { sourceId: string; url: string },
  >(opts: {
    collectFn: () => T[];
    knownIds: string[];
    maxItems: number;
    hydrateSelector: string;
    hydrateTimeoutMs?: number;
    scrollTimeoutMs?: number;
    stableThreshold?: number;
    scrollDelayMs?: number;
    scrollBehavior?: "scroll" | "click-next";
    nextSelector?: string;
    /**
     * Custom locator for the "next page" element when no plain CSS
     * selector can identify it (e.g. Are.na's "Load more" button —
     * matched by text, not class). Wins over `nextSelector` when
     * both are present. Called once per click-next iteration.
     */
    nextFinder?: () => HTMLElement | null;
    nextDelayMs?: number;
  }) {
    const {
      collectFn,
      knownIds,
      maxItems,
      hydrateSelector,
      hydrateTimeoutMs = 12_000,
      scrollTimeoutMs = 60_000,
      stableThreshold = 4,
      scrollDelayMs = 700,
      scrollBehavior = "scroll",
      nextSelector,
      nextFinder,
      nextDelayMs = 1500,
    } = opts;

    const _known = new Set(knownIds.map(String));
    const collected = new Map<string, T>();

    function ingest(rows: T[]): { full: boolean } {
      for (const r of rows) {
        if (!collected.has(r.sourceId)) collected.set(r.sourceId, r);
        if (collected.size >= maxItems) return { full: true };
      }
      return { full: false };
    }

    function result(reachedEnd: boolean) {
      return {
        ok: true as const,
        entries: Array.from(collected.values()),
        reachedEnd,
      };
    }

    const hydrateDeadline = Date.now() + hydrateTimeoutMs;
    while (Date.now() < hydrateDeadline) {
      if (document.querySelector(hydrateSelector)) break;
      await new Promise((r) => setTimeout(r, 250));
    }

    ingest(collectFn());
    if (collected.size >= maxItems) return result(false);

    if (scrollBehavior === "click-next") {
      const navDeadline = Date.now() + scrollTimeoutMs;
      while (Date.now() < navDeadline) {
        const next: HTMLElement | null = nextFinder
          ? nextFinder()
          : nextSelector
            ? document.querySelector<HTMLElement>(nextSelector)
            : document.querySelector<HTMLAnchorElement>(
                "a[rel*='next'], span.next-button > a",
              );
        if (!next) break;
        next.click();
        await new Promise((r) => setTimeout(r, nextDelayMs));
        const { full } = ingest(collectFn());
        if (full) return result(false);
      }
      return result(true);
    }

    const scrollDeadline = Date.now() + scrollTimeoutMs;
    let lastHeight = document.documentElement.scrollHeight;
    let stable = 0;
    while (Date.now() < scrollDeadline) {
      window.scrollBy({
        top: window.innerHeight * 0.9,
        behavior: "instant" as ScrollBehavior,
      });
      await new Promise((r) => setTimeout(r, scrollDelayMs));
      const { full } = ingest(collectFn());
      if (full) return result(false);
      const sh = document.documentElement.scrollHeight;
      if (sh === lastHeight) {
        stable += 1;
        if (stable >= stableThreshold) return result(true);
      } else {
        stable = 0;
        lastHeight = sh;
      }
    }
    return result(false);
  };
}
