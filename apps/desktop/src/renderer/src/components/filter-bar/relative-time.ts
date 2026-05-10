/**
 * Relative-time parser, backed by `chrono-node`. Used by the
 * global Add filter search to surface date filters from inputs
 * like `7 days`, `3d`, `past 2 weeks`, `last month`, `yesterday`,
 * `two days ago`, `tuesday`, `5/15/2026`, that no static preset
 * label happens to match literally.
 *
 * Output is an ISO-8601 duration with a leading minus sign so it
 * round-trips through `@pond/schema/filters/match`'s
 * `resolveNumeric` (which expects "ago" durations like `-P7D`).
 *
 * Date fields are compared with `gte`, so the synthesised
 * predicate reads as "saved within the last N units" — same shape
 * the date dropdown writes for its preset rows.
 *
 * chrono returns absolute `Date`s; we always project back onto a
 * relative `-PnD/-PnW/-PnM/-PnY` because the filter value space is
 * relative. The unit (day vs week vs month vs year) is picked
 * from the user's wording — "2 weeks ago" stays as `-P2W`, "30
 * days ago" stays as `-P30D`. When the input gives no unit hint
 * (e.g. `5/15/2026`), we fall back to days.
 */

import * as chrono from "chrono-node";

export interface RelativeMatch {
  /** ISO-8601 duration with leading minus sign, e.g. `-P7D`. */
  isoDuration: string;
  /** Human-readable label for the result row, e.g. `Past 7 days`. */
  label: string;
}

const MS_PER_DAY = 86_400_000;

export function parseRelative(query: string): RelativeMatch | null {
  const s = query.trim();
  if (!s) return null;

  const results = chrono.casual.parse(s, new Date(), { forwardDate: false });
  const r = results[0];
  if (!r) return null;

  /* Reject parses that didn't span (most of) the input — chrono
   * happily extracts "5" from "5 unrelated stuff" which would be
   * a false positive in a filter dropdown. */
  if (r.text.length / s.length < 0.5) return null;

  const target = r.start.date();
  const diffMs = Date.now() - target.getTime();

  /* Allow a small future tolerance so `today` (which chrono can
   * round to start-of-day) doesn't fall off the wrong side. */
  if (diffMs < -12 * 3600 * 1000) return null;
  /* Reject absurd parses (>50 years out) — likely a misparse. */
  if (diffMs > 50 * 365 * MS_PER_DAY) return null;

  const days = Math.max(1, Math.round(diffMs / MS_PER_DAY));
  return pickUnit(r.text.toLowerCase(), days);
}

/**
 * Pick the natural display unit from the user's wording. We
 * prefer the unit they typed ("month" → -PnM, "week" → -PnW)
 * over a strict day-count, so the label reads as the user
 * thinks about it.
 */
function pickUnit(text: string, daysAgo: number): RelativeMatch {
  if (/today|\bnow\b/.test(text)) {
    return { isoDuration: "-P1D", label: "Today" };
  }
  if (/yesterday/.test(text)) {
    return { isoDuration: "-P1D", label: "Yesterday" };
  }
  if (/year/.test(text)) {
    const y = Math.max(1, Math.round(daysAgo / 365));
    return {
      isoDuration: `-P${y}Y`,
      label: y === 1 ? "Past year" : `Past ${y} years`,
    };
  }
  if (/month/.test(text)) {
    const m = Math.max(1, Math.round(daysAgo / 30));
    return {
      isoDuration: `-P${m}M`,
      label: m === 1 ? "Past month" : `Past ${m} months`,
    };
  }
  if (/week/.test(text)) {
    const w = Math.max(1, Math.round(daysAgo / 7));
    return {
      isoDuration: `-P${w}W`,
      label: w === 1 ? "Past week" : `Past ${w} weeks`,
    };
  }
  return {
    isoDuration: `-P${daysAgo}D`,
    label: daysAgo === 1 ? "Yesterday" : `Past ${daysAgo} days`,
  };
}
