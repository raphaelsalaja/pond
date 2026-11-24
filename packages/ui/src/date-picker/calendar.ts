/** A local `YYYY-MM-DD` as midnight that day, or null when it isn't a real day. */
export function parseDay(value: string | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) {
    return null;
  }
  const [, year, month, day] = match.map(Number);
  if (year === undefined || month === undefined || day === undefined) {
    return null;
  }
  const date = new Date(year, month - 1, day);
  return date.getMonth() === month - 1 ? date : null;
}

export function formatDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Keeps the day of month where it can, so Jan 31 plus a month is Feb 28. */
export function addMonths(date: Date, months: number): Date {
  const first = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  return new Date(
    first.getFullYear(),
    first.getMonth(),
    Math.min(date.getDate(), last.getDate()),
  );
}

export function sameDay(a: Date | null, b: Date | null): boolean {
  return a !== null && b !== null && formatDay(a) === formatDay(b);
}

export function clampDay(date: Date, min: Date | null, max: Date | null) {
  if (min && date < min) {
    return min;
  }
  if (max && date > max) {
    return max;
  }
  return date;
}

/** Six full weeks starting on `weekStart` (0 is Sunday), so the grid never changes height. */
export function monthGrid(month: Date, weekStart: number): Array<Date> {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (first.getDay() - weekStart + 7) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

interface WeekInfoLocale {
  baseName: string;
  getWeekInfo?: () => { firstDay: number };
  weekInfo?: { firstDay: number };
}

/** First weekday for the locale as a `Date#getDay` index; Intl reports Monday as 1 and Sunday as 7. */
export function localeWeekStart(locale: string): number {
  try {
    const info: WeekInfoLocale = new Intl.Locale(locale);
    const firstDay = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay;
    return firstDay === undefined ? 0 : firstDay % 7;
  } catch {
    return 0;
  }
}
