import type { Fish, FishRun } from "@shared/fish-contracts";
import { formatPlural } from "@/shared/lib/format";

export type RunGroup = "failed" | "review" | "done";

export function runGroup(run: FishRun): RunGroup {
  if (run.status === "failed") return "failed";
  return run.changes > 0 ? "review" : "done";
}

export function runSentence(run: FishRun): string {
  const name = run.routineName ?? null;
  if (run.status === "failed")
    return name ? `${name} failed` : "A routine failed";
  const ran = name ? `Ran ${name}` : "Ran a routine";
  return run.changes > 0
    ? `${ran}, ${formatPlural(run.changes, { one: "change", other: "changes" })}`
    : ran;
}

/** Fish written before run history only carry `lastRun`. */
export function fishRuns(fish: Pick<Fish, "runs" | "lastRun">): FishRun[] {
  if (fish.runs?.length) return fish.runs;
  return fish.lastRun ? [fish.lastRun] : [];
}

export function runsByDay(
  runs: readonly FishRun[],
  now = new Date(),
): { day: string; runs: FishRun[] }[] {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const groups = new Map<string, FishRun[]>();
  for (const run of runs) {
    const at = new Date(run.at);
    const start = new Date(at);
    start.setHours(0, 0, 0, 0);
    const days = Math.round((today.getTime() - start.getTime()) / 86_400_000);
    const day =
      days <= 0
        ? "Today"
        : days === 1
          ? "Yesterday"
          : at.toLocaleDateString(undefined, {
              weekday: days < 7 ? "long" : undefined,
              month: days < 7 ? undefined : "short",
              day: days < 7 ? undefined : "numeric",
              year:
                at.getFullYear() === now.getFullYear() ? undefined : "numeric",
            });
    groups.set(day, [...(groups.get(day) ?? []), run]);
  }
  return [...groups].map(([day, runs]) => ({ day, runs }));
}

function startOfDay(at: number): number {
  const day = new Date(at);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

/** "today at 9:00 AM", "yesterday at 8:00 AM", "on Monday", "on Mar 3". */
export function relativeMoment(at: number, now = new Date()): string {
  const date = new Date(at);
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const days = Math.round(
    (startOfDay(at) - startOfDay(now.getTime())) / 86_400_000,
  );
  if (days === 0) return `today at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  if (days === -1) return `yesterday at ${time}`;
  if (Math.abs(days) < 7)
    return `on ${date.toLocaleDateString(undefined, { weekday: "long" })}`;
  return `on ${date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  })}`;
}

export function nextRunText(
  at: number | null,
  now = new Date(),
): string | null {
  if (at === null) return null;
  if (at <= now.getTime()) return "Next run soon";
  return `Next ${relativeMoment(at, now)}`;
}

/** The same moment as `nextRunText`, as a standalone value: "Today at 9:00 AM". */
export function nextRunValue(at: number, now = new Date()): string {
  if (at <= now.getTime()) return "Soon";
  const moment = relativeMoment(at, now);
  return moment.charAt(0).toUpperCase() + moment.slice(1);
}

export function lastRunText(run: FishRun, now = new Date()): string {
  const when = relativeMoment(run.at, now);
  if (run.status === "failed") return `Failed ${when}`;
  return run.changes > 0
    ? `Ran ${when}, ${formatPlural(run.changes, { one: "change", other: "changes" })}`
    : `Ran ${when}`;
}
