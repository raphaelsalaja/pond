import { describe, expect, it } from "vitest";
import {
  describeSyncSchedule,
  isSourceFetchDue,
  isSyncScheduleDue,
  nextSyncOccurrence,
} from "./sync-schedule";
import type { SyncSchedule } from "./sync-schedule";

const now = new Date(2026, 8, 7, 9, 0);
const daily: SyncSchedule = {
  enabled: true,
  intervalHours: 12,
  calendar: { kind: "daily", time: "09:00" },
};
describe("fetch schedules", () => {
  it("keeps legacy intervals and manual mode", () => {
    expect(
      isSyncScheduleDue(
        { enabled: true, intervalHours: 12 },
        now,
        +now - 12 * 3_600_000,
        0,
      ),
    ).toBe(true);
    expect(
      isSyncScheduleDue(
        { enabled: true, intervalHours: 12 },
        now,
        +now - 3_600_000,
        0,
      ),
    ).toBe(false);
    expect(isSyncScheduleDue({ ...daily, enabled: false }, now, 0, 0)).toBe(
      false,
    );
  });
  it("runs at the local deadline, once", () => {
    const before = new Date(2026, 8, 7, 8, 59);
    expect(isSyncScheduleDue(daily, before, 0, +before)).toBe(false);
    expect(isSyncScheduleDue(daily, now, 0, +before)).toBe(true);
    expect(isSyncScheduleDue(daily, now, +now, +before)).toBe(false);
  });
  it("catches a deadline crossed while asleep without replaying pre-start deadlines", () => {
    const after = new Date(2026, 8, 7, 11);
    expect(isSyncScheduleDue(daily, after, 0, +new Date(2026, 8, 7, 8))).toBe(
      true,
    );
    expect(isSyncScheduleDue(daily, after, 0, +after)).toBe(false);
  });
  it("only runs on selected weekdays", () => {
    const weekly: SyncSchedule = {
      ...daily,
      calendar: { kind: "weekly", days: [1, 3], time: "09:00" },
    };
    expect(isSyncScheduleDue(weekly, now, 0, +now - 60_000)).toBe(true);
    const tuesday = new Date(2026, 8, 8, 9);
    expect(isSyncScheduleDue(weekly, tuesday, 0, +tuesday - 60_000)).toBe(
      false,
    );
    expect(describeSyncSchedule(weekly)).toBe("Mon, Wed at 09:00");
  });
});

const recurring: SyncSchedule = {
  enabled: true,
  intervalHours: 12,
  recurrence: {
    startDate: "2026-01-31",
    every: 1,
    unit: "month",
    time: "18:00",
    days: [1],
  },
};
it("clamps month ends without drifting the following month", () => {
  expect(nextSyncOccurrence(recurring, new Date(2026, 0, 31, 18))).toEqual(
    new Date(2026, 1, 28, 18),
  );
  expect(nextSyncOccurrence(recurring, new Date(2026, 1, 28, 18))).toEqual(
    new Date(2026, 2, 31, 18),
  );
});
it("honors a future start and every N months", () => {
  const rule: SyncSchedule = {
    ...recurring,
    recurrence: {
      startDate: "2026-01-31",
      every: 3,
      unit: "month",
      time: "18:00",
      days: [1],
    },
  };
  expect(nextSyncOccurrence(rule, new Date(2025, 11, 1))).toEqual(
    new Date(2026, 0, 31, 18),
  );
  expect(nextSyncOccurrence(rule, new Date(2026, 0, 31, 18))).toEqual(
    new Date(2026, 3, 30, 18),
  );
});
it("anchors alternate weeks and excludes days before the start", () => {
  const rule: SyncSchedule = {
    ...recurring,
    recurrence: {
      startDate: "2026-09-09",
      every: 2,
      unit: "week",
      time: "09:00",
      days: [1, 3],
    },
  };
  expect(nextSyncOccurrence(rule, new Date(2026, 8, 7))).toEqual(
    new Date(2026, 8, 9, 9),
  );
  expect(nextSyncOccurrence(rule, new Date(2026, 8, 9, 9))).toEqual(
    new Date(2026, 8, 21, 9),
  );
});
it("runs missed recurrence once and skips pre-launch occurrences", () => {
  const after = new Date(2026, 1, 28, 19);
  expect(
    isSyncScheduleDue(recurring, after, 0, +new Date(2026, 1, 28, 17)),
  ).toBe(true);
  expect(isSyncScheduleDue(recurring, after, +after, 0)).toBe(false);
  expect(isSyncScheduleDue(recurring, after, 0, +after)).toBe(false);
  expect(
    nextSyncOccurrence({ ...recurring, enabled: false }, after),
  ).toBeNull();
});
it("anchors hourly repeats to the start date", () => {
  const rule: SyncSchedule = {
    ...recurring,
    recurrence: {
      startDate: "2026-09-09",
      every: 6,
      unit: "hour",
      time: "18:00",
      days: [1],
    },
  };
  expect(nextSyncOccurrence(rule, new Date(2026, 8, 8, 23))).toEqual(
    new Date(2026, 8, 9),
  );
  expect(nextSyncOccurrence(rule, new Date(2026, 8, 9, 6))).toEqual(
    new Date(2026, 8, 9, 12),
  );
});

describe("per-source fetch schedules", () => {
  const hour = 3_600_000;
  const at = Date.parse("2026-09-07T09:00:00Z");
  const synced = (hoursAgo: number) =>
    new Date(at - hoursAgo * hour).toISOString();

  it("follows the global schedule without an interval", () => {
    expect(isSourceFetchDue({ lastSyncedAt: synced(1) }, true, at)).toBe(true);
    expect(isSourceFetchDue({ lastSyncedAt: synced(99) }, false, at)).toBe(
      false,
    );
  });

  it("never runs a paused source on a schedule", () => {
    expect(
      isSourceFetchDue({ paused: true, lastSyncedAt: null }, true, at),
    ).toBe(false);
  });

  it("runs on its own interval regardless of the global schedule", () => {
    const sync = { intervalHours: 2, lastSyncedAt: synced(3) };
    expect(isSourceFetchDue(sync, false, at)).toBe(true);
    expect(
      isSourceFetchDue({ ...sync, lastSyncedAt: synced(1) }, true, at),
    ).toBe(false);
  });

  it("waits out the interval after a failed attempt", () => {
    const sync = { intervalHours: 2, lastSyncedAt: synced(5) };
    expect(isSourceFetchDue(sync, false, at, at - hour)).toBe(false);
  });
});
