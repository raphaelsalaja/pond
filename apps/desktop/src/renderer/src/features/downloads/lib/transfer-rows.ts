import type { TransferJob } from "@shared/transfer-contracts";
import type { DownloadRow, DownloadStatus } from "./status-feed/downloads";

export const TRANSFER_LABELS = {
  export_eagle_package: "Export Eagle Package",
  export_files: "Export Files",
  export_package: "Export Pond Package",
  export_share_page: "Export Share Page",
  publish_share_link: "Publish Share Link",
  import_eagle_package: "Import Eagle Package",
  import_package: "Import Pond Package",
  copy_library: "Copy to Library",
  merge_library: "Merge Library",
} satisfies Record<TransferJob["request"]["kind"], string>;

const STATUSES = {
  running: "running",
  cancelling: "running",
  completed: "complete",
  failed: "failed",
  interrupted: "failed",
  cancelled: "cancelled",
} satisfies Record<TransferJob["status"], DownloadStatus>;

export function transferActive(job: TransferJob): boolean {
  return job.status === "running" || job.status === "cancelling";
}

export function transferCanRetry(job: TransferJob): boolean {
  return (
    job.status === "failed" ||
    job.status === "cancelled" ||
    job.status === "interrupted"
  );
}

export function transferRevealable(job: TransferJob): boolean {
  return job.status === "completed" && job.request.kind.startsWith("export_");
}

export function transferStatusLabel(job: TransferJob): string {
  if (job.status === "cancelling") {
    return "Canceling";
  }
  if (job.status === "interrupted") {
    return "Interrupted";
  }
  if (job.status === "running") {
    return job.total
      ? `${job.phase} ${job.completed} of ${job.total}`
      : job.phase || "In Progress";
  }
  return "";
}

function lastSegment(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

export function transferToDownloadRow(job: TransferJob): DownloadRow {
  const id = `transfer:${job.id}`;
  const active = transferActive(job);
  return {
    id,
    saveId: id,
    name: lastSegment(job.request.destination),
    url: "",
    source: "local",
    status: STATUSES[job.status],
    stage: TRANSFER_LABELS[job.request.kind],
    op: null,
    progress: job.total
      ? job.completed / job.total
      : job.status === "completed"
        ? 1
        : null,
    attempts: 0,
    error: job.status === "cancelled" ? null : job.error,
    ts: job.startedAt,
    durationMs: active ? null : Math.max(0, job.updatedAt - job.startedAt),
    live: active,
    transfer: job,
  };
}
