import * as chrono from "chrono-node";

export interface RelativeMatch {
  isoDuration: string;
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
