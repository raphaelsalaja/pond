import type { FishRoutine, FishWhen } from "./fish-contracts";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEKDAYS = [1, 2, 3, 4, 5];
const WEEKENDS = [0, 6];

function sameDays(days: readonly number[], expected: readonly number[]) {
  return (
    days.length === expected.length && expected.every((d) => days.includes(d))
  );
}

function clockTime(time: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return new Date(2024, 0, 1, hours, minutes).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function dayName(day: number, width: "long" | "short"): string {
  return new Date(2024, 0, 7 + day).toLocaleDateString("en-US", {
    weekday: width,
  });
}

function listed(parts: readonly string[]): string {
  if (parts.length < 3) return parts.join(" and ");
  return `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
}

/** The schedule in words, the way the routine list and the fish's replies read it. */
export function describeWhen(when: FishWhen): string {
  if (when.kind === "newSaves") return "When new Saves arrive";
  if (when.kind === "inbox") return "When Saves arrive in the Inbox";
  if (when.kind === "every") {
    if (when.hours === 1) return "Every hour";
    if (when.hours === 24) return "Every day";
    if (when.hours === 168) return "Every week";
    if (when.hours % 24 === 0) return `Every ${when.hours / 24} days`;
    return `Every ${when.hours} hours`;
  }
  const days = [...new Set(when.days)].sort();
  const at = `around ${clockTime(when.time)}`;
  if (days.length === 7) return `Every day ${at}`;
  if (sameDays(days, WEEKDAYS)) return `Weekdays ${at}`;
  if (sameDays(days, WEEKENDS)) return `Weekends ${at}`;
  if (days.length === 1) return `${dayName(days[0] ?? 0, "long")}s ${at}`;
  return `${listed(days.map((day) => dayName(day, "short")))} ${at}`;
}

/** The latest scheduled moment at or before `now`, in local time. */
function previousSlot(
  when: Extract<FishWhen, { kind: "daily" }>,
  now: number,
): number | null {
  const [hours = 0, minutes = 0] = when.time.split(":").map(Number);
  for (let back = 0; back <= 7; back += 1) {
    const slot = new Date(now - back * DAY);
    slot.setHours(hours, minutes, 0, 0);
    if (slot.getTime() <= now && when.days.includes(slot.getDay()))
      return slot.getTime();
  }
  return null;
}

/** New routines wait for their next scheduled time; paused ones only run when you ask. */
export function isRoutineDue(routine: FishRoutine, now: number): boolean {
  if (routine.paused) return false;
  const since = routine.lastRun?.at ?? routine.createdAt;
  if (routine.when.kind === "every")
    return now - since >= routine.when.hours * HOUR;
  if (routine.when.kind === "daily") {
    const slot = previousSlot(routine.when, now);
    return slot !== null && slot > since;
  }
  return false;
}
