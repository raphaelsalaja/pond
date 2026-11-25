import { ASSISTANT_ACTIVITY_LABELS } from "@shared/assistant";
import type { FishSummary } from "@shared/fish-contracts";
import { formatPlural } from "@/shared/lib/format";
import { systemLocale } from "@/shared/lib/system-locale";

export interface RowPreview {
  text: string;
  tone: "busy" | "alert" | "quiet" | undefined;
}

export function rowPreview(
  fish: Pick<FishSummary, "activity" | "lastRun" | "latest">,
): RowPreview {
  if (fish.activity) {
    return { text: ASSISTANT_ACTIVITY_LABELS[fish.activity], tone: "busy" };
  }
  const run = fish.lastRun;
  if (run && !run.seen) {
    if (run.status === "failed") {
      return { text: run.error ?? "Routine failed", tone: "alert" };
    }
    if (run.changes) {
      return {
        text: `${formatPlural(run.changes, { one: "change", other: "changes" })} to review`,
        tone: undefined,
      };
    }
  }
  const latest = fish.latest;
  if (!latest) {
    return { text: "No messages yet", tone: "quiet" };
  }
  if (latest.from === "routine") {
    return { text: "Ran its routine", tone: "quiet" };
  }
  if (latest.from === "you") {
    return { text: `You: ${latest.text}`, tone: undefined };
  }
  return { text: latest.text || "Replied", tone: undefined };
}

function startOfDay(date: Date): number {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

export function rowTime(at: number, now: Date): string {
  const date = new Date(at);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days <= 0) {
    return date.toLocaleTimeString(systemLocale, {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  if (days === 1) {
    return "Yesterday";
  }
  if (days < 7) {
    return date.toLocaleDateString(systemLocale, { weekday: "short" });
  }
  return date.toLocaleDateString(systemLocale, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export function rowTimestamp(
  fish: Pick<FishSummary, "lastRun" | "latest">,
): number | null {
  const times = [fish.latest?.at, fish.lastRun?.at].filter(
    (at): at is number => at !== undefined,
  );
  return times.length ? Math.max(...times) : null;
}
