import type { GlobalSyncPrefs } from "@pond/schema/db";

const HOUR_MS = 60 * 60 * 1000;

export interface ParsedTime {
  hours: number;
  minutes: number;
}

export function parseHHmm(value: string): ParsedTime | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!m) return null;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23) return null;
  if (minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

export function isInQuietHours(
  at: Date,
  quiet: { start: string; end: string },
): boolean {
  const start = parseHHmm(quiet.start);
  const end = parseHHmm(quiet.end);
  if (!start || !end) return false;
  const minutes = at.getHours() * 60 + at.getMinutes();
  const startMins = start.hours * 60 + start.minutes;
  const endMins = end.hours * 60 + end.minutes;
  if (startMins === endMins) return false;
  if (startMins < endMins) return minutes >= startMins && minutes < endMins;
  return minutes >= startMins || minutes < endMins;
}

export function nextQuietHoursEnd(
  at: Date,
  quiet: { start: string; end: string },
): Date {
  if (!isInQuietHours(at, quiet)) return at;
  const end = parseHHmm(quiet.end);
  if (!end) return at;
  const out = new Date(at);
  out.setHours(end.hours, end.minutes, 0, 0);
  if (out.getTime() <= at.getTime()) {
    out.setDate(out.getDate() + 1);
  }
  return out;
}

function nextAnchored(
  from: Date,
  anchorTime: string,
  weekdays: number[],
): Date | null {
  const parsed = parseHHmm(anchorTime);
  if (!parsed) return null;
  const allowed = new Set(weekdays.filter((d) => d >= 0 && d <= 6));
  if (allowed.size === 0) return null;
  for (let i = 0; i < 14; i++) {
    const day = new Date(from);
    day.setDate(day.getDate() + i);
    day.setHours(parsed.hours, parsed.minutes, 0, 0);
    if (day.getTime() > from.getTime() && allowed.has(day.getDay())) {
      return day;
    }
  }
  return null;
}

export function computeNextDueAt(
  prefs: GlobalSyncPrefs,
  now: Date,
): Date | null {
  if (!prefs.enabled) return null;
  const lastFire = prefs.lastFireAt ? new Date(prefs.lastFireAt) : null;
  const lastFireValid = lastFire && !Number.isNaN(lastFire.getTime());

  let due: Date;
  switch (prefs.frequency) {
    case "hourly":
      due = lastFireValid ? new Date(lastFire.getTime() + HOUR_MS) : now;
      break;
    case "every6h":
      due = lastFireValid ? new Date(lastFire.getTime() + 6 * HOUR_MS) : now;
      break;
    case "daily":
    case "weekly": {
      const from = lastFireValid
        ? new Date(Math.max(lastFire.getTime(), now.getTime() - 1))
        : new Date(now.getTime() - 1);
      const anchor = nextAnchored(from, prefs.anchorTime, prefs.weekdays);
      if (!anchor) return null;
      due = anchor;
      break;
    }
    default:
      return null;
  }

  if (prefs.quietHours) {
    due = nextQuietHoursEnd(due, prefs.quietHours);
  }

  return due;
}
