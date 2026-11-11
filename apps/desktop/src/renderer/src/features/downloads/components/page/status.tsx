import { sourceLabel } from "@pond/schema/sources";
import type { DownloadRow } from "@/features/downloads/lib/status-feed";

export type DownloadTableStatus =
  | "progress"
  | "failed"
  | "complete"
  | "paused"
  | "cancelled"
  | "skipped";

const STATUS_LABELS = {
  progress: "In Progress",
  failed: "Failed",
  complete: "Completed",
  paused: "Paused",
  cancelled: "Canceled",
  skipped: "Skipped",
} satisfies Record<DownloadTableStatus, string>;

function isDownloadWaiting(row: DownloadRow): boolean {
  return (
    row.status === "waiting" ||
    row.status === "parked" ||
    row.status === "blocked" ||
    row.status === "retrying"
  );
}

export function isDownloadStopped(row: DownloadRow, paused: boolean): boolean {
  return paused && isDownloadWaiting(row) && !row.interactive;
}

export function isDownloadProcessing(row: DownloadRow): boolean {
  return (
    row.op === "ensure_poster" ||
    row.op === "render_text_cover" ||
    row.op === "finalize"
  );
}

export function downloadTableStatus(
  row: DownloadRow,
  paused: boolean,
): DownloadTableStatus {
  if (row.status === "complete") return "complete";
  if (
    row.status === "failed" ||
    row.status === "blocked" ||
    row.status === "dead"
  )
    return "failed";
  if (row.status === "cancelled") return "cancelled";
  if (row.status === "skipped") return "skipped";
  if (isDownloadStopped(row, paused)) return "paused";
  return "progress";
}

export function downloadStatusLabel(row: DownloadRow, paused: boolean): string {
  if (isDownloadStopped(row, paused)) return "Paused";
  if (row.status === "waiting") return "Waiting";
  if (row.status === "parked") return `Waiting for ${sourceLabel(row.source)}`;
  if (row.status === "retrying") {
    if (row.nextRunAt == null) return "Retrying";
    const seconds = Math.max(
      0,
      Math.ceil((row.nextRunAt - Date.now()) / 1_000),
    );
    if (seconds < 60) return `Retrying in ${seconds}s`;
    const minutes = Math.ceil(seconds / 60);
    if (minutes < 60) return `Retrying in ${minutes}m`;
    return `Retrying in ${Math.ceil(minutes / 60)}h`;
  }
  return STATUS_LABELS[downloadTableStatus(row, paused)];
}
