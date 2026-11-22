import { describe, expect, it } from "vitest";
import { snoozeOptions, snoozeUntil } from "./snooze";

const at = (...parts: [number, number, number, number, number]) =>
  new Date(...parts);

function summary(now: Date) {
  return snoozeOptions(now).map((option) => {
    const until = new Date(option.until);
    return [option.id, until.getDate(), until.getHours()];
  });
}

describe("snoozeOptions", () => {
  it("offers later today, tomorrow, the weekend, and next week midweek", () => {
    expect(summary(at(2026, 10, 11, 14, 40))).toEqual([
      ["later-today", 11, 17],
      ["tomorrow", 12, 9],
      ["weekend", 14, 9],
      ["next-week", 16, 9],
    ]);
  });

  it("drops later today at night and the weekend once it starts", () => {
    expect(summary(at(2026, 10, 13, 22, 5))).toEqual([
      ["tomorrow", 14, 9],
      ["next-week", 16, 9],
    ]);
  });

  it("snoozes a Monday to the following Monday", () => {
    expect(summary(at(2026, 10, 16, 8, 0)).at(-1)).toEqual([
      "next-week",
      23,
      9,
    ]);
  });
});

describe("snoozeUntil", () => {
  const now = at(2026, 10, 14, 12, 0).getTime();

  it("reads a local day and time", () => {
    expect(snoozeUntil("2026-11-20", "08:30", now)).toBe(
      at(2026, 10, 20, 8, 30).getTime(),
    );
  });

  it("rejects a time that has passed or does not parse", () => {
    expect(snoozeUntil("2026-11-14", "11:59", now)).toBeNull();
    expect(snoozeUntil("2026-11-20", "", now)).toBeNull();
    expect(snoozeUntil("", "08:30", now)).toBeNull();
  });
});
