import { systemLocale } from "./system-locale";

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

const rtf = new Intl.RelativeTimeFormat(systemLocale, { numeric: "always" });

function ago(diff: number): string {
  if (diff < MINUTE) {
    return rtf.format(-Math.max(1, Math.floor(diff / SECOND)), "second");
  }
  if (diff < HOUR) {
    return rtf.format(-Math.floor(diff / MINUTE), "minute");
  }
  if (diff < DAY) {
    return rtf.format(-Math.floor(diff / HOUR), "hour");
  }
  if (diff < MONTH) {
    return rtf.format(-Math.floor(diff / DAY), "day");
  }
  if (diff < YEAR) {
    return rtf.format(-Math.floor(diff / MONTH), "month");
  }
  return rtf.format(-Math.floor(diff / YEAR), "year");
}

export function relativeTime(iso: string | null): string {
  if (!iso) {
    return "never";
  }
  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) {
    return "never";
  }
  return ago(Date.now() - ms);
}

export function compactAge(ms: number): string {
  const diff = Math.max(0, Date.now() - ms);
  if (diff < MINUTE) {
    return "now";
  }
  if (diff < HOUR) {
    return `${Math.floor(diff / MINUTE)}m`;
  }
  if (diff < DAY) {
    return `${Math.floor(diff / HOUR)}h`;
  }
  if (diff < 7 * DAY) {
    return `${Math.floor(diff / DAY)}d`;
  }
  if (diff < YEAR) {
    return `${Math.floor(diff / (7 * DAY))}w`;
  }
  return `${Math.floor(diff / YEAR)}y`;
}

export function relativeTimeFromMs(ms: number | null, fallback = "—"): string {
  if (ms === null) {
    return fallback;
  }
  return ago(Date.now() - ms);
}
