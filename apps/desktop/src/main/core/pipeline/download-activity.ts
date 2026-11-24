import type { Op } from "@pond/schema/db";
import type {
  DownloadActivity,
  DownloadPhase,
  ReportDownloadActivity,
} from "@shared/download-activity";

const INITIAL_PHASE = {
  harvest_metadata: "harvesting",
  capture_tweet: "capturing",
  render_text_cover: "processing",
  fetch_blobs: "starting",
  archive_page: "capturing",
  fetch_video_ytdlp: "starting",
  ensure_poster: "processing",
  fetch_avatar: "starting",
  finalize: "finalizing",
} satisfies Record<Op, DownloadPhase>;

export function createDownloadActivityStore(
  recentLimit = 100,
  now: () => number = Date.now,
) {
  const entries = new Map<string, DownloadActivity>();

  function begin(task: { id: string; saveId: string; op: Op }) {
    const at = now();
    const phase = INITIAL_PHASE[task.op];
    const activity: DownloadActivity = {
      taskId: task.id,
      saveId: task.saveId,
      op: task.op,
      state: "running",
      startedAt: at,
      updatedAt: at,
      phase,
      phaseStartedAt: at,
      transfers: [],
      timeline: [{ phase, at }],
    };
    entries.set(task.id, activity);
    let settled = false;
    const report: ReportDownloadActivity = (update) => {
      if (settled || entries.get(task.id) !== activity) {
        return;
      }
      const at = now();
      if (update.transfer) {
        const transfer = structuredClone(update.transfer);
        const index = activity.transfers.findIndex(
          (entry) =>
            (entry.transferId ?? entry.fileIndex) ===
            (transfer.transferId ?? transfer.fileIndex),
        );
        const previous = activity.transfers[index];
        transfer.lastByteAt =
          transfer.receivedBytes !== undefined &&
          transfer.receivedBytes > (previous?.receivedBytes ?? 0)
            ? at
            : previous?.lastByteAt;
        if (index >= 0) {
          activity.transfers[index] = transfer;
        } else {
          if (activity.transfers.length >= 64) {
            const finished = activity.transfers.findIndex(
              (entry) =>
                entry.state === "completed" || entry.state === "failed",
            );
            if (finished >= 0) {
              activity.transfers.splice(finished, 1);
            }
          }
          if (activity.transfers.length < 64) {
            activity.transfers.push(transfer);
          }
        }
      }
      const phase =
        update.transfer &&
        activity.transfers.some((transfer) => transfer.state === "receiving")
          ? "receiving"
          : update.transfer &&
              activity.transfers.some(
                (transfer) => transfer.state === "requesting",
              )
            ? "requesting"
            : update.phase;
      if (activity.phase !== phase) {
        activity.phaseStartedAt = at;
        activity.timeline.push({
          phase,
          at,
          fileIndex: update.transfer?.fileIndex,
        });
        activity.timeline = activity.timeline.slice(-32);
      }
      activity.phase = phase;
      activity.updatedAt = at;
    };
    function finish(state: "completed" | "failed") {
      if (settled || entries.get(task.id) !== activity) {
        return;
      }
      report({ phase: state });
      settled = true;
      activity.state = state;
      for (const transfer of activity.transfers) {
        if (transfer.state === "requesting" || transfer.state === "receiving") {
          transfer.state = state;
          transfer.bytesPerSecond = undefined;
          transfer.etaSeconds = undefined;
        }
      }
      const recent = [...entries.values()]
        .filter((entry) => entry.state !== "running")
        .sort((a, b) => b.updatedAt - a.updatedAt);
      for (const entry of recent.slice(recentLimit)) {
        entries.delete(entry.taskId);
      }
    }
    return { report, finish };
  }

  return {
    begin,
    reset: () => entries.clear(),
    snapshot: (): Array<DownloadActivity> => {
      const snapshot = structuredClone([...entries.values()]);
      for (const activity of snapshot) {
        for (const transfer of activity.transfers) {
          if (
            transfer.state === "receiving" &&
            now() - (transfer.lastByteAt ?? transfer.startedAt) >= 2000
          ) {
            transfer.bytesPerSecond = 0;
            transfer.etaSeconds = undefined;
          }
        }
      }
      return snapshot;
    },
  };
}

export const downloadActivity = createDownloadActivityStore();
