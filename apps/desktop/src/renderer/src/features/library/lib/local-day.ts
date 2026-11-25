import type { FieldId, Predicate } from "@pond/schema/filters/types";

export function startOfLocalDay(date: Date): string {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).toISOString();
}

export function endOfLocalDay(date: Date): string {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
    0,
    0,
    0,
    -1,
  ).toISOString();
}

export function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function formatLocalDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function parseLocalDay(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  return formatLocalDay(date) === text ? date : null;
}

/** Today stays open-ended so it equals the filter menu's Today preset and its chip reads Today. */
export function localDayPredicate(
  field: FieldId,
  day: Date,
  now = new Date(),
): Predicate {
  if (formatLocalDay(day) === formatLocalDay(now)) {
    return { field, operator: "gte", value: startOfLocalDay(now) };
  }
  return {
    field,
    operator: "between",
    value: [startOfLocalDay(day), endOfLocalDay(day)],
  };
}
