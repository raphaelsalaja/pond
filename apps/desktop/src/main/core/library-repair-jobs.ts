import { randomUUID } from "node:crypto";
import type {
  LibraryRepairJob,
  LibraryRepairKind,
} from "../../shared/library-repair-contracts";
import { libraryRepairService } from "./library-repairs";

interface RepairJobRecord {
  job: LibraryRepairJob;
  controller: AbortController;
  createdAt: number;
}

const jobs = new Map<string, RepairJobRecord>();
const MAX_RETAINED_JOBS = 100;

export function startLibraryRepairPreview(
  kind: LibraryRepairKind,
  saveIds?: readonly string[],
): LibraryRepairJob {
  const record = createJob("preview", kind);
  void runPreview(record, saveIds);
  return copyJob(record.job);
}

export function startLibraryRepairApply(token: string): LibraryRepairJob {
  const kind = libraryRepairService.kindForToken(token);
  if (!kind) throw new Error("This repair preview expired. Preview again.");
  const record = createJob("apply", kind);
  void runApply(record, token);
  return copyJob(record.job);
}

export function cancelLibraryRepairJob(id: string): LibraryRepairJob | null {
  const record = jobs.get(id);
  if (!record) return null;
  if (record.job.status === "queued" || record.job.status === "running") {
    record.controller.abort();
    record.job.status = "cancelled";
  }
  return copyJob(record.job);
}

export function getLibraryRepairJob(id: string): LibraryRepairJob | null {
  const record = jobs.get(id);
  return record ? copyJob(record.job) : null;
}

function createJob(
  phase: LibraryRepairJob["phase"],
  kind: LibraryRepairKind,
): RepairJobRecord {
  pruneJobs();
  const id = randomUUID();
  const record: RepairJobRecord = {
    job: {
      id,
      phase,
      kind,
      status: "queued",
      processed: 0,
      total: 0,
    },
    controller: new AbortController(),
    createdAt: Date.now(),
  };
  jobs.set(id, record);
  return record;
}

async function runPreview(
  record: RepairJobRecord,
  saveIds: readonly string[] | undefined,
): Promise<void> {
  record.job.status = "running";
  try {
    record.job.preview = await libraryRepairService.preview({
      kind: record.job.kind,
      saveIds,
      signal: record.controller.signal,
      onProgress(processed, total) {
        record.job.processed = processed;
        record.job.total = total;
      },
    });
    if (record.controller.signal.aborted) {
      record.job.status = "cancelled";
      libraryRepairService.discard(record.job.preview.token);
      delete record.job.preview;
      return;
    }
    record.job.status = "completed";
  } catch (error) {
    settleFailure(
      record,
      error instanceof Error ? error : new Error("The Library repair failed."),
    );
  }
}

async function runApply(record: RepairJobRecord, token: string): Promise<void> {
  record.job.status = "running";
  try {
    const applied = await libraryRepairService.apply({
      token,
      signal: record.controller.signal,
      onProgress(processed, total) {
        record.job.processed = processed;
        record.job.total = total;
      },
    });
    record.job.result = applied.result;
    record.job.status = record.controller.signal.aborted
      ? "cancelled"
      : "completed";
  } catch (error) {
    settleFailure(
      record,
      error instanceof Error ? error : new Error("The Library repair failed."),
    );
  }
}

function settleFailure(record: RepairJobRecord, error: Error): void {
  if (
    record.controller.signal.aborted ||
    (error instanceof DOMException && error.name === "AbortError")
  ) {
    record.job.status = "cancelled";
    return;
  }
  record.job.status = "failed";
  record.job.error = error.message;
}

function pruneJobs(): void {
  if (jobs.size < MAX_RETAINED_JOBS) return;
  const removable = [...jobs.values()]
    .filter(
      (record) =>
        record.job.status !== "queued" && record.job.status !== "running",
    )
    .sort((a, b) => a.createdAt - b.createdAt);
  while (jobs.size >= MAX_RETAINED_JOBS) {
    const record = removable.shift();
    if (!record) return;
    jobs.delete(record.job.id);
  }
}

function copyJob(job: LibraryRepairJob): LibraryRepairJob {
  return structuredClone(job);
}
