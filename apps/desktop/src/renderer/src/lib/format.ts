/**
 * Small renderer-side formatting helpers. Pure functions; safe to call
 * during render. None of these allocate `Intl.*` instances per call —
 * we lazily memoise the formatters since `Intl.NumberFormat` is the
 * expensive part of the call chain.
 */

const COMPACT_FORMATTER: Intl.NumberFormat = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const FULL_FORMATTER: Intl.NumberFormat = new Intl.NumberFormat("en");

/**
 * Compact number for chips: `1.2K`, `3.4M`. Falls back to the raw
 * number for sub-thousand values so single digits stay legible.
 */
export function formatCompactNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) < 1000) return String(Math.round(n));
  return COMPACT_FORMATTER.format(n);
}

/** Locale-grouped full number for tooltips: `1,234,567`. */
export function formatFullNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return FULL_FORMATTER.format(n);
}

/**
 * Hours:minutes:seconds for video durations. Mirrors the helper in
 * [`save-preview/index.tsx`](apps/desktop/src/renderer/src/components/save-preview/index.tsx#formatHms)
 * so chapters and durations format identically. Numbers <60s drop the
 * leading minute; numbers ≥1h get the full `h:mm:ss`.
 */
export function formatHms(seconds: number): string {
  const sec = Math.max(0, Math.floor(seconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const r = sec % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  return `${m}:${String(r).padStart(2, "0")}`;
}

const RELATIVE_FORMATTER: Intl.RelativeTimeFormat = new Intl.RelativeTimeFormat(
  "en",
  { numeric: "auto" },
);

const RELATIVE_THRESHOLDS: Array<{
  unit: Intl.RelativeTimeFormatUnit;
  ms: number;
}> = [
  { unit: "year", ms: 365 * 24 * 60 * 60 * 1000 },
  { unit: "month", ms: 30 * 24 * 60 * 60 * 1000 },
  { unit: "week", ms: 7 * 24 * 60 * 60 * 1000 },
  { unit: "day", ms: 24 * 60 * 60 * 1000 },
  { unit: "hour", ms: 60 * 60 * 1000 },
  { unit: "minute", ms: 60 * 1000 },
  { unit: "second", ms: 1000 },
];

/**
 * Relative time string from an ISO date or `Date`. Returns `null` when
 * the input doesn't parse — call sites should hide the field rather
 * than render "Invalid Date".
 *
 * Future timestamps are supported (e.g. scheduled posts) and surface
 * as "in 2 days". `null` / empty / unparseable inputs all produce
 * `null` so the caller can branch with `??`.
 */
export function formatRelativeTime(
  input: string | Date | null | undefined,
): string | null {
  if (input == null || input === "") return null;
  const date = input instanceof Date ? input : new Date(input);
  const t = date.getTime();
  if (!Number.isFinite(t)) return null;
  const diffMs = t - Date.now();
  const abs = Math.abs(diffMs);
  for (const { unit, ms } of RELATIVE_THRESHOLDS) {
    if (abs >= ms || unit === "second") {
      const value = Math.round(diffMs / ms);
      return RELATIVE_FORMATTER.format(value, unit);
    }
  }
  return null;
}

/**
 * Convert yt-dlp's `upload_date` (`YYYYMMDD`) to an ISO date string.
 * Returns `null` when the input doesn't match the expected shape so
 * the caller can fall back to other timestamps.
 */
export function ytdlpDateToIso(date: string | undefined | null): string | null {
  if (!date) return null;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(date);
  if (!m) return null;
  const [, y, mo, d] = m;
  const iso = `${y}-${mo}-${d}T00:00:00.000Z`;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? iso : null;
}

/**
 * Convert a unix-seconds timestamp (yt-dlp's `release_timestamp`,
 * `timestamp`) to an ISO string. Returns `null` for non-finite or
 * obviously bogus inputs (year < 1990).
 */
export function unixSecondsToIso(
  seconds: number | undefined | null,
): string | null {
  if (seconds == null) return null;
  if (!Number.isFinite(seconds)) return null;
  if (seconds < 631152000) return null;
  return new Date(seconds * 1000).toISOString();
}
