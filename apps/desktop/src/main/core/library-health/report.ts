import type { LibraryHealthOverview } from "../../../shared/library-health-contracts";
import type { QueueSummary } from "../../../shared/queue-contracts";

/** Keeps the report small enough to attach to an issue. */
const REPORT_LIMIT = 200;

/** Library Health for the Debug Report: counts, Save IDs, and file findings, never titles, paths, or URLs. */
export function debugReportHealth(input: {
  overview: LibraryHealthOverview;
  queue: QueueSummary | null;
  redact: (value: string) => string;
}) {
  const { overview, queue, redact } = input;
  const { check, job, media } = overview;
  return {
    check: check
      ? {
          checkedAt: new Date(check.checkedAt).toISOString(),
          durationMs: check.durationMs,
          saves: check.saves,
          counts: check.counts,
          index: check.index
            ? {
                orphans: check.index.orphans.length,
                missing: check.index.missing.length,
                unreadable: check.index.unreadable.length,
                backupVerified: check.index.backupError === null,
              }
            : null,
          indexCheckFailed: check.indexError !== null,
          issues: check.issues.slice(0, REPORT_LIMIT).map((issue) => ({
            kind: issue.kind,
            saveId: issue.saveId,
            originals: issue.originals,
            files: issue.files.map((file) => ({
              kind: file.kind,
              finding: file.finding,
              expectedSize: file.expectedSize,
              foundSize: file.foundSize,
            })),
          })),
          posters: check.posters.slice(0, REPORT_LIMIT).map((gap) => ({
            saveId: gap.saveId,
            videos: gap.videos,
            posters: gap.posters,
          })),
          unverified: check.unverified.slice(0, REPORT_LIMIT).map((save) => ({
            saveId: save.saveId,
            reason: redact(save.reason),
          })),
        }
      : null,
    job: job
      ? {
          status: job.status,
          processed: job.processed,
          total: job.total,
        }
      : null,
    media: {
      state: media.state,
      prepared: media.prepared,
      remaining: media.remaining,
      pendingPosters: media.pendingPosters,
      pauseReason: media.pauseReason,
      discovering: media.discovering,
      failures: media.failures.slice(0, REPORT_LIMIT).map((failure) => ({
        saveId: failure.saveId,
        kind: failure.kind,
        at: new Date(failure.at).toISOString(),
        error: redact(failure.error),
      })),
    },
    queue,
  };
}
