/// <reference lib="dom" />

/**
 * Shared Twitter/X DOM helpers. Serializable via `.toString()` for
 * injection into both the list collector and item collector.
 */
export function inPageTwitterNormalize() {
  function pickLargestSrcset(srcset: string): string | undefined {
    const parts = srcset
      .split(",")
      .map((p) => p.trim())
      .map((p) => {
        const [u, sz] = p.split(/\s+/);
        return { u, w: sz ? Number.parseInt(sz, 10) : 0 };
      })
      .filter((p) => p.u);
    if (!parts.length) return undefined;
    parts.sort((a, b) => b.w - a.w);
    return parts[0]?.u;
  }

  function upgradeTwimgUrl(url: string): string {
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
  }

  function parseMetric(label: string | null | undefined): number | undefined {
    if (!label) return undefined;
    const m = label.match(/([\d.,]+)\s*([KMB]?)/i);
    if (!m?.[1]) return undefined;
    const num = Number.parseFloat(m[1].replace(/,/g, ""));
    if (!Number.isFinite(num)) return undefined;
    const suffix = (m[2] ?? "").toUpperCase();
    const mult =
      suffix === "K"
        ? 1_000
        : suffix === "M"
          ? 1_000_000
          : suffix === "B"
            ? 1_000_000_000
            : 1;
    return Math.round(num * mult);
  }

  function metricFromTestid(root: Element, testid: string): number | undefined {
    const el = root.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
    if (!el) return undefined;
    const label =
      el.getAttribute("aria-label") ??
      el.closest("[role='button']")?.getAttribute("aria-label") ??
      el.textContent ??
      "";
    return parseMetric(label);
  }

  function readDuration(video: HTMLVideoElement | null): number | undefined {
    if (!video) return undefined;
    const d = video.duration;
    if (typeof d === "number" && Number.isFinite(d) && d > 0) {
      return Math.round(d);
    }
    return undefined;
  }

  return {
    pickLargestSrcset,
    upgradeTwimgUrl,
    parseMetric,
    metricFromTestid,
    readDuration,
  };
}
