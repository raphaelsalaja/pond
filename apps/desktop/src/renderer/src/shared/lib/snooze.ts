export interface SnoozeOption {
  id: "later-today" | "tomorrow" | "weekend" | "next-week";
  label: string;
  until: number;
}

const MORNING_HOUR = 9;
const LATER_TODAY_HOURS = 3;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function morning(from: Date, days: number): number {
  const day = new Date(from);
  day.setDate(day.getDate() + days);
  day.setHours(MORNING_HOUR, 0, 0, 0);
  return day.getTime();
}

/** Days snooze to a morning so a Save comes back at the start of the day, not at the hour it was snoozed. */
export function snoozeOptions(now = new Date()): SnoozeOption[] {
  const options: SnoozeOption[] = [];
  const later = new Date(now);
  later.setHours(later.getHours() + LATER_TODAY_HOURS, 0, 0, 0);
  if (later.getDate() === now.getDate())
    options.push({
      id: "later-today",
      label: "Later Today",
      until: later.getTime(),
    });
  options.push({ id: "tomorrow", label: "Tomorrow", until: morning(now, 1) });
  const weekday = now.getDay();
  if (weekday >= 1 && weekday <= 4)
    options.push({
      id: "weekend",
      label: "This Weekend",
      until: morning(now, 6 - weekday),
    });
  options.push({
    id: "next-week",
    label: "Next Week",
    until: morning(now, (8 - weekday) % 7 || 7),
  });
  return options;
}

/** Reads a local `YYYY-MM-DD` day and `HH:MM` time; anything not in the future is rejected. */
export function snoozeUntil(
  day: string,
  time: string,
  now = Date.now(),
): number | null {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  const clock = /^(\d{2}):(\d{2})$/.exec(time);
  if (!date || !clock) return null;
  const until = new Date(
    Number(date[1]),
    Number(date[2]) - 1,
    Number(date[3]),
    Number(clock[1]),
    Number(clock[2]),
  ).getTime();
  return Number.isFinite(until) && until > now ? until : null;
}

export function formatSnoozeTime(until: number, now = Date.now()): string {
  return new Intl.DateTimeFormat(
    undefined,
    until - now < WEEK_MS
      ? { weekday: "short", hour: "numeric", minute: "2-digit" }
      : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" },
  ).format(until);
}
