import type { SplitAllProgress } from "@shared/saves-mutation-contracts";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { formatNumber, formatPlural } from "@/shared/lib/format";
import {
  type NotifyOptions,
  notify,
  updateNotification,
} from "@/shared/lib/toast";

const POLL_MS = 500;
const SAVES = { one: "save", other: "saves" };
const PROGRESS_LABEL = "Split progress";

const store = new Store({ running: false });
let tracking: Promise<void> | null = null;

export function splittableDescription(count: number): string {
  if (count === 0) return "No saves have several images or videos.";
  return `Splits ${formatPlural(count, SAVES)} with several images or videos, which can't be undone.`;
}

export function splitAllProgressText(progress: SplitAllProgress): string {
  return `${formatNumber(progress.processed)} of ${formatPlural(progress.total, SAVES)}`;
}

export function splitAllDoneCopy(
  progress: SplitAllProgress,
): Pick<NotifyOptions, "title" | "description"> {
  const failed =
    progress.failed === 0
      ? undefined
      : `${formatPlural(progress.failed, SAVES)} couldn't be split and ${progress.failed === 1 ? "is" : "are"} unchanged. Split again to retry.`;
  if (progress.split === 0)
    return {
      title: failed ? "Couldn't split" : "Nothing to split",
      description: failed,
    };
  return {
    title: `Split ${formatPlural(progress.split, SAVES)} into ${formatNumber(progress.split + progress.created)}`,
    description: failed,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function follow(first: SplitAllProgress): Promise<void> {
  store.setState(() => ({ running: true }));
  const id = notify({
    id: "split-all",
    title: "Splitting saves",
    description:
      first.total > 0 ? splitAllProgressText(first) : "Finding saves",
    progress: { label: PROGRESS_LABEL },
    timeout: 0,
  });
  let progress = first;
  try {
    while (progress.running) {
      await delay(POLL_MS);
      progress = await window.pond.query("saves.splitAllStatus", {});
      if (!progress.running || progress.total === 0) continue;
      updateNotification({
        id,
        title: "Splitting saves",
        description: splitAllProgressText(progress),
        progress: {
          label: PROGRESS_LABEL,
          value: progress.processed,
          max: progress.total,
        },
        timeout: 0,
      });
    }
    updateNotification({ id, ...splitAllDoneCopy(progress), timeout: 8000 });
  } catch {
    updateNotification({
      id,
      title: "Couldn't check the split",
      description:
        "Open Settings > Images > Carousels to see if it's still running.",
      timeout: 8000,
    });
  } finally {
    store.setState(() => ({ running: false }));
  }
}

function track(progress: SplitAllProgress): Promise<void> {
  tracking ??= follow(progress).finally(() => {
    tracking = null;
  });
  return tracking;
}

/** Splits every multi-image save in the main process and shows its progress in a toast. */
export async function splitAllSaves(): Promise<void> {
  await track(await window.pond.query("saves.splitAll", {}));
}

/** Picks a run back up after a reload, so its toast and the Settings button stay in step. */
export async function resumeSplitAll(): Promise<void> {
  const progress = await window.pond.query("saves.splitAllStatus", {});
  if (progress.running) await track(progress);
}

export function useSplitAllRunning(): boolean {
  return useSelector(store, (s) => s.running);
}
