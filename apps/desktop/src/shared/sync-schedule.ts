import type { Prefs, SourceSyncPrefs } from "@pond/schema";

export type SyncSchedule = Prefs["sync"]["cron"];

/** A source with its own interval runs on that clock; the rest wait for the global schedule. */
export function isSourceFetchDue(
  sync: Pick<SourceSyncPrefs, "paused" | "intervalHours" | "lastSyncedAt">,
  globalDue: boolean,
  now: number,
  lastAttemptAt = 0,
): boolean {
  if (sync.paused) {
    return false;
  }
  if (sync.intervalHours === undefined) {
    return globalDue;
  }
  const synced = sync.lastSyncedAt ? Date.parse(sync.lastSyncedAt) : 0;
  const last = Math.max(lastAttemptAt, Number.isNaN(synced) ? 0 : synced);
  return now - last >= sync.intervalHours * 3_600_000;
}

export function isSyncScheduleDue(
  schedule: SyncSchedule,
  now: Date,
  lastRunAt: number,
  calendarSince: number,
): boolean {
  if (!schedule.enabled) {
    return false;
  }
  if (schedule.recurrence) {
    const next = nextSyncOccurrence(
      schedule,
      new Date(Math.max(lastRunAt, calendarSince)),
    );
    return next !== null && next.getTime() <= now.getTime();
  }
  if (!schedule.calendar) {
    return now.getTime() - lastRunAt >= schedule.intervalHours * 3_600_000;
  }
  const { calendar } = schedule;
  const [hours = 0, minutes = 0] = calendar.time.split(":").map(Number);
  for (let offset = 0; offset < 7; offset++) {
    const candidate = new Date(now);
    candidate.setDate(candidate.getDate() - offset);
    candidate.setHours(hours, minutes, 0, 0);
    if (
      calendar.kind === "weekly" &&
      !calendar.days.includes(candidate.getDay())
    ) {
      continue;
    }
    const at = candidate.getTime();
    if (at <= now.getTime() && at > Math.max(lastRunAt, calendarSince)) {
      return true;
    }
  }
  return false;
}

export function describeSyncSchedule(schedule: SyncSchedule): string {
  if (!schedule.enabled) {
    return "Manual only";
  }
  if (schedule.recurrence) {
    const { every, unit, time } = schedule.recurrence;
    return `Every ${every} ${unit}${every === 1 ? "" : "s"}${unit === "hour" ? "" : ` at ${time}`}`;
  }
  if (!schedule.calendar) {
    return `Every ${schedule.intervalHours} ${schedule.intervalHours === 1 ? "hour" : "hours"}`;
  }
  const { calendar } = schedule;
  if (calendar.kind === "daily") {
    return `Daily at ${calendar.time}`;
  }
  const names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${calendar.days.map((day) => names[day]).join(", ")} at ${calendar.time}`;
}

function dayNumber(date: Date): number {
  return (
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000
  );
}

export function nextSyncOccurrence(
  schedule: SyncSchedule,
  after: Date,
): Date | null {
  if (!schedule.enabled || !schedule.recurrence) {
    return null;
  }
  const rule = schedule.recurrence;
  const [year = 2026, month = 1, day = 1] = rule.startDate
    .split("-")
    .map(Number);
  const [hour = 0, minute = 0] = rule.time.split(":").map(Number);
  const start = new Date(
    year,
    month - 1,
    day,
    rule.unit === "hour" ? 0 : hour,
    rule.unit === "hour" ? 0 : minute,
  );
  if (rule.unit === "hour") {
    const interval = rule.every * 3_600_000;
    return new Date(
      +start +
        Math.max(0, Math.floor((+after - +start) / interval) + 1) * interval,
    );
  }
  const elapsedDays = dayNumber(after) - dayNumber(start);
  const elapsedMonths =
    (after.getFullYear() - year) * 12 + after.getMonth() - (month - 1);
  const startWeekday = (start.getDay() + 6) % 7;
  const elapsed =
    rule.unit === "month"
      ? elapsedMonths
      : rule.unit === "week"
        ? (elapsedDays + startWeekday) / 7
        : elapsedDays;
  const firstCycle = Math.max(0, Math.floor(elapsed / rule.every) - 1);
  for (let cycle = firstCycle; cycle < firstCycle + 4; cycle++) {
    const candidate = new Date(start);
    if (rule.unit === "month") {
      candidate.setDate(1);
      candidate.setMonth(candidate.getMonth() + cycle * rule.every);
      const lastDay = new Date(
        candidate.getFullYear(),
        candidate.getMonth() + 1,
        0,
      ).getDate();
      candidate.setDate(Math.min(day, lastDay));
    } else {
      candidate.setDate(
        candidate.getDate() +
          cycle * rule.every * (rule.unit === "week" ? 7 : 1) -
          (rule.unit === "week" ? startWeekday : 0),
      );
    }
    for (let offset = 0; offset < (rule.unit === "week" ? 7 : 1); offset++) {
      const occurrence = new Date(candidate);
      occurrence.setDate(occurrence.getDate() + offset);
      if (rule.unit === "week" && !rule.days.includes(occurrence.getDay())) {
        continue;
      }
      if (+occurrence >= +start && +occurrence > +after) {
        return occurrence;
      }
    }
  }
  return null;
}
