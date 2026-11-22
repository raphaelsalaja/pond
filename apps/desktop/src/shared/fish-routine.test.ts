import { describe, expect, it } from "vitest";
import type { FishRoutine, FishWhen } from "./fish-contracts";
import { describeWhen, isRoutineDue, nextRun } from "./fish-routine";

const HOUR = 60 * 60 * 1000;

function routine(when: FishWhen, patch: Partial<FishRoutine> = {}) {
  return {
    id: "r1",
    name: "Morning Digest",
    instruction: "Summarize yesterday's saves.",
    when,
    paused: false,
    lastRun: null,
    createdAt: new Date(2026, 9, 26, 6, 0).getTime(),
    updatedAt: 0,
    ...patch,
  } satisfies FishRoutine;
}

describe("describeWhen", () => {
  it("reads each schedule in words", () => {
    expect(describeWhen({ kind: "newSaves" })).toBe("When new Saves arrive");
    expect(describeWhen({ kind: "inbox" })).toBe(
      "When Saves arrive in the Inbox",
    );
    expect(describeWhen({ kind: "every", hours: 1 })).toBe("Every hour");
    expect(describeWhen({ kind: "every", hours: 6 })).toBe("Every 6 hours");
    expect(describeWhen({ kind: "every", hours: 72 })).toBe("Every 3 days");
    expect(describeWhen({ kind: "every", hours: 168 })).toBe("Every week");
    expect(
      describeWhen({ kind: "daily", time: "08:00", days: [1, 2, 3, 4, 5] }),
    ).toBe("Weekdays around 8:00 AM");
    expect(describeWhen({ kind: "daily", time: "21:30", days: [6, 0] })).toBe(
      "Weekends around 9:30 PM",
    );
    expect(describeWhen({ kind: "daily", time: "09:00", days: [1] })).toBe(
      "Mondays around 9:00 AM",
    );
    expect(
      describeWhen({ kind: "daily", time: "09:00", days: [5, 1, 3] }),
    ).toBe("Mon, Wed, and Fri around 9:00 AM");
  });
});

describe("isRoutineDue", () => {
  const daily: FishWhen = {
    kind: "daily",
    time: "08:00",
    days: [0, 1, 2, 3, 4, 5, 6],
  };

  it("waits for the first scheduled time after it was created", () => {
    const morning = routine(daily);
    expect(isRoutineDue(morning, new Date(2026, 9, 26, 7, 59).getTime())).toBe(
      false,
    );
    expect(isRoutineDue(morning, new Date(2026, 9, 26, 8, 1).getTime())).toBe(
      true,
    );
  });

  it("runs once per slot", () => {
    const ran = routine(daily, {
      lastRun: {
        at: new Date(2026, 9, 26, 8, 1).getTime(),
        chatId: null,
        status: "done",
        changes: 0,
        seen: true,
      },
    });
    expect(isRoutineDue(ran, new Date(2026, 9, 26, 20, 0).getTime())).toBe(
      false,
    );
    expect(isRoutineDue(ran, new Date(2026, 9, 27, 8, 0).getTime())).toBe(true);
  });

  it("counts intervals from the last run and skips paused routines", () => {
    const every = routine({ kind: "every", hours: 6 });
    expect(isRoutineDue(every, every.createdAt + 5 * HOUR)).toBe(false);
    expect(isRoutineDue(every, every.createdAt + 6 * HOUR)).toBe(true);
    expect(
      isRoutineDue({ ...every, paused: true }, every.createdAt + 6 * HOUR),
    ).toBe(false);
    expect(
      isRoutineDue(routine({ kind: "newSaves" }), every.createdAt + 99 * HOUR),
    ).toBe(false);
  });
});

describe("nextRun", () => {
  const at = (day: number, hours: number, minutes = 0) =>
    new Date(2026, 9, day, hours, minutes).getTime();
  const weekdays: FishWhen = {
    kind: "daily",
    time: "09:00",
    days: [1, 2, 3, 4, 5],
  };

  it("finds the next daily slot, skipping days off", () => {
    expect(nextRun(weekdays, at(26, 6), at(26, 7))).toBe(at(26, 9));
    expect(nextRun(weekdays, at(26, 9, 1), at(26, 10))).toBe(at(27, 9));
    expect(nextRun(weekdays, at(30, 9, 1), at(30, 10))).toBe(at(33, 9));
  });

  it("says now when a slot has passed without a run", () => {
    expect(nextRun(weekdays, at(26, 6), at(26, 10))).toBe(at(26, 10));
  });

  it("counts intervals from the last run", () => {
    const every: FishWhen = { kind: "every", hours: 6 };
    expect(nextRun(every, at(26, 6), at(26, 7))).toBe(at(26, 12));
    expect(nextRun(every, at(26, 6), at(26, 13))).toBe(at(26, 13));
  });

  it("has no clock time for event routines", () => {
    expect(nextRun({ kind: "newSaves" }, at(26, 6), at(26, 7))).toBeNull();
    expect(nextRun({ kind: "inbox" }, at(26, 6), at(26, 7))).toBeNull();
  });
});
