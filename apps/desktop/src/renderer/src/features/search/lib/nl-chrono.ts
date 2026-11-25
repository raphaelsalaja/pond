import type { FieldId, Predicate } from "@pond/schema/filters/types";
import { parse as parseDates } from "chrono-node";
import { ROLLING_WINDOWS } from "@/features/search/lib/nl-vocabulary";

type ChronoResult = ReturnType<typeof parseDates>[number];
type ChronoComponents = ChronoResult["start"];

interface DateExtraction {
  predicates: Array<Predicate>;
  rest: string;
}

type Direction = "before" | "after" | "since";

const DIRECTION = new Map<string, Direction>([
  ["before", "before"],
  ["older", "before"],
  ["earlier", "before"],
  ["after", "after"],
  ["newer", "after"],
  ["since", "since"],
]);

const QUALIFIER = new Map<string, FieldId>([
  ["published", "publishedAt"],
  ["posted", "publishedAt"],
  ["modified", "modifiedAt"],
  ["updated", "modifiedAt"],
  ["edited", "modifiedAt"],
  ["changed", "modifiedAt"],
  ["saved", "savedAt"],
  ["added", "savedAt"],
  ["created", "savedAt"],
]);

const PREFIX_RE =
  /(?:\b(published|posted|modified|updated|edited|changed|saved|added|created)\b\s+)?(?:\b(before|after|since|older|newer|earlier)\b\s+(?:than\s+|to\s+)?)?(?:\b(?:in|on|from|during|of)\b\s+)?$/i;

/** A media duration ("5 minutes", "30s") is a video length, not a date, and must not be eaten by chrono. */
const DURATION_TEXT =
  /\b\d+(?:\.\d+)?\s*(?:s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)\b/i;

const YEAR_RE = /\b(?:19|20)\d{2}\b/g;

const RANGE_CONNECTOR = /^\s*(?:and|to|through|until|-|–|—)\s*$/i;

const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addMonths = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth() + n, 1);
const startOfYear = (d: Date) => new Date(d.getFullYear(), 0, 1);
const addYears = (d: Date, n: number) => new Date(d.getFullYear() + n, 0, 1);

interface Span {
  start: number;
  end: number;
}

function widen(c: ChronoComponents, date: Date): [Date, Date] {
  if (c.isCertain("day")) {
    const lo = startOfDay(date);
    return [lo, addDays(lo, 1)];
  }
  if (c.isCertain("month")) {
    const lo = startOfMonth(date);
    return [lo, addMonths(lo, 1)];
  }
  const lo = startOfYear(date);
  return [lo, addYears(lo, 1)];
}

function impliedRange(c: ChronoComponents): [Date, Date] {
  return widen(c, c.date());
}

function lowerWithYear(c: ChronoComponents, year: number | null): Date {
  if (year === null || c.isCertain("year")) {
    return impliedRange(c)[0];
  }
  const month = (c.get("month") ?? 1) - 1;
  const day = c.isCertain("day") ? (c.get("day") ?? 1) : 1;
  return widen(c, new Date(year, month, day))[0];
}

function yearRange(year: number): [Date, Date] {
  return [new Date(year, 0, 1), new Date(year + 1, 0, 1)];
}

function isTimeOnly(c: ChronoComponents): boolean {
  const hasDate =
    c.isCertain("day") ||
    c.isCertain("month") ||
    c.isCertain("year") ||
    c.isCertain("weekday");
  const hasTime =
    c.isCertain("hour") || c.isCertain("minute") || c.isCertain("second");
  return hasTime && !hasDate;
}

interface DatePrefix {
  field: FieldId;
  dir: Direction | null;
  from: number;
}

function readPrefix(input: string, start: number): DatePrefix {
  const m = PREFIX_RE.exec(input.slice(0, start));
  if (!m || m[0].length === 0) {
    return { field: "savedAt", dir: null, from: start };
  }
  const qualifier = m[1]?.toLowerCase();
  const direction = m[2]?.toLowerCase();
  return {
    field: qualifier ? (QUALIFIER.get(qualifier) ?? "savedAt") : "savedAt",
    dir: direction ? (DIRECTION.get(direction) ?? null) : null,
    from: start - m[0].length,
  };
}

function directionalPredicate(
  field: FieldId,
  dir: Direction | null,
  lo: Date,
  hi: Date,
): Predicate {
  if (dir === "before") return { field, operator: "lt", value: isoDay(lo) };
  if (dir === "after") return { field, operator: "gte", value: isoDay(hi) };
  if (dir === "since") return { field, operator: "gte", value: isoDay(lo) };
  return { field, operator: "between", value: [isoDay(lo), isoDay(hi)] };
}

function rollingPrefix(
  input: string,
  start: number,
): Omit<DatePrefix, "dir"> | null {
  const m = PREFIX_RE.exec(input.slice(0, start));
  if (m?.[2]) return null;
  const qualifier = m?.[1]?.toLowerCase();
  return {
    field: qualifier ? (QUALIFIER.get(qualifier) ?? "savedAt") : "savedAt",
    from: m && m[0].length > 0 ? start - m[0].length : start,
  };
}

export function extractDates(
  input: string,
  ref: Date = new Date(),
): DateExtraction {
  const predicates: Array<Predicate> = [];
  const consumed: Array<Span> = [];
  const overlaps = (s: number, e: number) =>
    consumed.some((c) => s < c.end && e > c.start);
  const claim = (s: number, e: number, pred: Predicate) => {
    consumed.push({ start: s, end: e });
    predicates.push(pred);
  };

  for (const [phrase, iso] of ROLLING_WINDOWS) {
    const re = new RegExp(
      `\\b${phrase.replaceAll(/\s+/g, String.raw`\s+`)}\\b`,
      "gi",
    );
    for (let m = re.exec(input); m; m = re.exec(input)) {
      const start = m.index;
      const end = start + m[0].length;
      if (overlaps(start, end)) continue;
      const prefix = rollingPrefix(input, start);
      if (!prefix) continue;
      claim(prefix.from, end, {
        field: prefix.field,
        operator: "gte",
        value: iso,
      });
    }
  }

  const results = parseDates(input, ref, { forwardDate: false });
  for (let idx = 0; idx < results.length; idx += 1) {
    const r = results[idx];
    if (!r) continue;
    const start = r.index;
    const end = start + r.text.length;
    if (overlaps(start, end)) continue;
    if (isTimeOnly(r.start)) continue;
    if (DURATION_TEXT.test(r.text) && !/\bago\b/i.test(r.text)) continue;

    const { field, dir, from } = readPrefix(input, start);

    const next = results[idx + 1];
    if (next && RANGE_CONNECTOR.test(input.slice(end, next.index))) {
      const tail = next.end ?? next.start;
      const lo = lowerWithYear(r.start, tail.get("year"));
      const hi = impliedRange(tail)[1];
      claim(from, next.index + next.text.length, {
        field,
        operator: "between",
        value: [isoDay(lo), isoDay(hi)],
      });
      idx += 1;
      continue;
    }

    const [lo] = impliedRange(r.start);
    const hi = r.end ? impliedRange(r.end)[1] : impliedRange(r.start)[1];
    claim(from, end, directionalPredicate(field, dir, lo, hi));
  }

  for (let m = YEAR_RE.exec(input); m; m = YEAR_RE.exec(input)) {
    const start = m.index;
    const end = start + m[0].length;
    if (overlaps(start, end)) continue;
    const { field, dir, from } = readPrefix(input, start);
    const [lo, hi] = yearRange(Number.parseInt(m[0], 10));
    claim(from, end, directionalPredicate(field, dir, lo, hi));
  }

  let rest = input;
  for (const { start, end } of consumed) {
    rest = rest.slice(0, start) + " ".repeat(end - start) + rest.slice(end);
  }

  return { predicates, rest };
}
