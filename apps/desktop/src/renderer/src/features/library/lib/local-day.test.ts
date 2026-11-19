import { describe, expect, it } from "vitest";
import {
  addLocalDays,
  endOfLocalDay,
  formatLocalDay,
  localDayPredicate,
  parseLocalDay,
  startOfLocalDay,
} from "./local-day";

function localParts(iso: string) {
  const date = new Date(iso);
  return {
    day: formatLocalDay(date),
    time: [
      date.getHours(),
      date.getMinutes(),
      date.getSeconds(),
      date.getMilliseconds(),
    ],
  };
}

describe("local day bounds", () => {
  it.each([
    ["an ordinary day", new Date(2026, 10, 14, 15, 30)],
    ["the US spring-forward day", new Date(2026, 2, 8, 12)],
    ["the US fall-back day", new Date(2026, 10, 1, 12)],
    ["the EU spring-forward day", new Date(2026, 2, 29, 12)],
    ["the EU fall-back day", new Date(2026, 9, 25, 12)],
  ])("spans the whole local calendar day on %s", (_, date) => {
    const start = startOfLocalDay(date);
    const end = endOfLocalDay(date);
    const day = formatLocalDay(date);
    expect(localParts(start)).toEqual({ day, time: [0, 0, 0, 0] });
    expect(localParts(end)).toEqual({ day, time: [23, 59, 59, 999] });
    expect(formatLocalDay(new Date(Date.parse(start) - 1))).toBe(
      formatLocalDay(addLocalDays(date, -1)),
    );
    expect(localParts(new Date(Date.parse(end) + 1).toISOString())).toEqual({
      day: formatLocalDay(addLocalDays(date, 1)),
      time: [0, 0, 0, 0],
    });
  });

  it("steps calendar days rather than 24-hour periods", () => {
    expect(formatLocalDay(addLocalDays(new Date(2026, 2, 9, 0, 30), -1))).toBe(
      "2026-03-08",
    );
    expect(formatLocalDay(addLocalDays(new Date(2026, 0, 1), -1))).toBe(
      "2025-12-31",
    );
  });
});

describe("local day text", () => {
  it("round-trips a local day", () => {
    const day = parseLocalDay("2026-11-14");
    expect(day && formatLocalDay(day)).toBe("2026-11-14");
  });

  it("rejects days that don't exist", () => {
    expect(parseLocalDay("2026-02-30")).toBeNull();
    expect(parseLocalDay("2026-11-14T00:00")).toBeNull();
    expect(parseLocalDay("")).toBeNull();
  });
});

describe("local day predicate", () => {
  const now = new Date(2026, 10, 19, 15, 45);

  it("matches the filter menu's Today preset for today", () => {
    const earlier = new Date(2026, 10, 19, 1);
    expect(localDayPredicate("savedAt", earlier, now)).toEqual({
      field: "savedAt",
      operator: "gte",
      value: startOfLocalDay(now),
    });
  });

  it("covers an earlier day from its first to its last millisecond", () => {
    const day = new Date(2026, 10, 14);
    expect(localDayPredicate("savedAt", day, now)).toEqual({
      field: "savedAt",
      operator: "between",
      value: [startOfLocalDay(day), endOfLocalDay(day)],
    });
  });
});
