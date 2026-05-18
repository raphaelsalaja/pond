import {
  IconOpenInBrowserOutline18,
  IconRefreshClockwiseOutline18,
  IconTrashXmarkOutline18,
} from "@pond/icons/outline/18";
import type { Op } from "@pond/schema/db";
import { Dialog, useToast } from "@pond/ui";
import { useCallback, useEffect, useState } from "react";
import { SourceBadge } from "@/components/source-badge";
import { optimistic } from "@/pool/bootstrap";
import { pool, subscribeToAll } from "@/pool/pool";
import type { ProcessingProgressWire } from "../../../../preload";
import styles from "./styles.module.css";

/* Mirrors `ProcessingDetailWire` in
 * `apps/desktop/src/main/ipc/queries/saves.ts`. Kept renderer-local so
 * the bundle doesn't pull `electron-log` and other main-side modules
 * across the contextBridge. */
export interface ProcessingDetail {
  id: string;
  url: string;
  title: string | null;
  source: string;
  status: "ingesting" | "failed";
  progress: { done: number; total: number };
  stageOp: Op | null;
  lastError: string | null;
  ingestStartedAt: string | null;
}

const STAGE_LABELS: Record<Op, string> = {
  harvest_metadata: "Fetching metadata",
  capture_tweet: "Capturing tweet",
  fetch_blobs: "Downloading media",
  fetch_video_ytdlp: "Downloading video",
  ensure_poster: "Generating thumbnail",
  fetch_avatar: "Fetching avatar",
  finalize: "Finalizing",
};

interface ContentProps {
  open: boolean;
  /* Live counts owned by the trigger button. Passed in so the dialog
   * can auto-close itself when both hit zero without each consumer
   * needing its own subscription. */
  ingestingCount: number;
  failedCount: number;
  onClose: () => void;
}

function Content({ open, ingestingCount, failedCount, onClose }: ContentProps) {
  const [details, setDetails] = useState<ProcessingDetail[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessingProgressWire | null>(null);
  const toast = useToast();

  const refresh = useCallback(async () => {
    const next = (await window.pond.query(
      "saves.processingDetails",
    )) as ProcessingDetail[];
    setDetails(next);
  }, []);

  useEffect(() => {
    if (!open) return;
    void refresh();
    /* The pool fires `subscribeToAll` on every save mutation, which
     * happens whenever a task moves status. Piggyback that for live
     * dialog updates instead of polling. */
    return subscribeToAll(() => {
      void refresh();
    });
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return;
    const off = window.pond.onProcessingProgress((status) => {
      setProgress(status);
      void refresh();
    });
    return off;
  }, [open, refresh]);

  /* Auto-close once everything's settled. Use the live pool counts
   * rather than the in-flight details fetch so we don't race a stale
   * snapshot. */
  useEffect(() => {
    if (!open) return;
    if (ingestingCount === 0 && failedCount === 0) onClose();
  }, [open, ingestingCount, failedCount, onClose]);

  const ingestingRows = (details ?? []).filter((d) => d.status === "ingesting");
  const failedRows = (details ?? []).filter((d) => d.status === "failed");

  const handleRetry = useCallback(
    async (id: string) => {
      setBusyId(id);
      try {
        const res = (await window.pond.query("saves.retryFailed", { id })) as {
          ok: boolean;
          reason?: string;
        };
        if (!res.ok) {
          toast.add({
            title: "Couldn't retry",
            description: res.reason ?? undefined,
            type: "error",
          });
        }
      } finally {
        setBusyId(null);
        void refresh();
      }
    },
    [refresh, toast],
  );

  const handleOpen = useCallback(
    async (url: string) => {
      try {
        await window.pond.openExternal(url);
      } catch {
        toast.add({ title: "Couldn't open URL", type: "error" });
      }
    },
    [toast],
  );

  const handleDelete = useCallback(
    async (id: string) => {
      const prev = pool.get(id);
      if (!prev) return;
      setBusyId(id);
      try {
        await optimistic(
          () => {
            pool.upsert({ ...prev, deletedAt: Date.now() } as typeof prev);
          },
          () => {
            pool.upsert(prev);
          },
          async () => window.pond.tx({ kind: "trash", model: "save", id }),
        );
        toast.add({ title: "Moved to trash", type: "success" });
      } finally {
        setBusyId(null);
        void refresh();
      }
    },
    [refresh, toast],
  );

  const handleRetryAll = useCallback(async () => {
    const res = (await window.pond.query("saves.retryAllFailed")) as
      | { ok: true; total: number }
      | { ok: false; reason: "already_running" | "no_saves" };
    if (!res.ok) {
      const label =
        res.reason === "already_running"
          ? "Retry already in progress"
          : "Nothing to retry";
      toast.add({ title: label });
    }
  }, [toast]);

  const backfillRunning = progress?.state === "running";
  const backfillMessage = progress?.message;

  return (
    <Dialog.Content className={styles.dialog}>
      <header className={styles.header}>
        <Dialog.Title>Processing</Dialog.Title>
        <Dialog.Description>
          {describeCounts(ingestingCount, failedCount)}
        </Dialog.Description>
        {failedCount > 0 ? (
          <button
            type="button"
            className={styles["retry-all"]}
            onClick={handleRetryAll}
            disabled={backfillRunning}
          >
            <IconRefreshClockwiseOutline18 width="0.85em" height="0.85em" />
            <span>
              {backfillRunning
                ? "Retrying…"
                : `Retry all failed (${failedCount})`}
            </span>
          </button>
        ) : null}
      </header>

      {backfillRunning && backfillMessage ? (
        <p className={styles["backfill-status"]}>{backfillMessage}</p>
      ) : null}

      <div className={styles.scroll}>
        {ingestingRows.length > 0 ? (
          <section className={styles.section}>
            <h3 className={styles["section-title"]}>
              Ingesting{" "}
              <span className={styles["section-count"]}>
                {ingestingRows.length}
              </span>
            </h3>
            <ul className={styles.list}>
              {ingestingRows.map((row) => (
                <li key={row.id} className={styles.row} data-status="ingesting">
                  <SourceBadge.Root source={row.source} data-size="sm" />
                  <div className={styles.body}>
                    <span className={styles.title} title={row.url}>
                      {row.title?.trim() || displayUrl(row.url)}
                    </span>
                    <span className={styles.stage}>
                      {row.stageOp ? STAGE_LABELS[row.stageOp] : "Queued"}
                    </span>
                  </div>
                  <ProgressBar
                    done={row.progress.done}
                    total={row.progress.total}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {failedRows.length > 0 ? (
          <section className={styles.section}>
            <h3 className={styles["section-title"]}>
              Failed{" "}
              <span className={styles["section-count"]}>
                {failedRows.length}
              </span>
            </h3>
            <ul className={styles.list}>
              {failedRows.map((row) => (
                <li key={row.id} className={styles.row} data-status="failed">
                  <SourceBadge.Root source={row.source} data-size="sm" />
                  <div className={styles.body}>
                    <span className={styles.title} title={row.url}>
                      {row.title?.trim() || displayUrl(row.url)}
                    </span>
                    {row.lastError ? (
                      <span className={styles.error} title={row.lastError}>
                        {row.lastError}
                      </span>
                    ) : null}
                  </div>
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles["row-button"]}
                      aria-label="Retry"
                      title="Retry"
                      onClick={() => handleRetry(row.id)}
                      disabled={busyId === row.id}
                    >
                      <IconRefreshClockwiseOutline18
                        width="0.95em"
                        height="0.95em"
                      />
                    </button>
                    <button
                      type="button"
                      className={styles["row-button"]}
                      aria-label="Open URL"
                      title="Open URL"
                      onClick={() => handleOpen(row.url)}
                    >
                      <IconOpenInBrowserOutline18
                        width="0.95em"
                        height="0.95em"
                      />
                    </button>
                    <button
                      type="button"
                      className={styles["row-button"]}
                      aria-label="Delete"
                      title="Delete"
                      onClick={() => handleDelete(row.id)}
                      disabled={busyId === row.id}
                    >
                      <IconTrashXmarkOutline18 width="0.95em" height="0.95em" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {details && ingestingRows.length === 0 && failedRows.length === 0 ? (
          <p className={styles.empty}>Nothing to show — closing.</p>
        ) : null}
      </div>
    </Dialog.Content>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <span
      className={styles.progress}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${done} of ${total} tasks done`}
    >
      <span className={styles["progress-fill"]} style={{ width: `${pct}%` }} />
    </span>
  );
}

function displayUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`.replace(/\/$/, "") || u.host;
  } catch {
    return url;
  }
}

function describeCounts(ingesting: number, failed: number): string {
  const parts: string[] = [];
  if (ingesting > 0) parts.push(`${ingesting} processing`);
  if (failed > 0) parts.push(`${failed} failed`);
  if (parts.length === 0) return "All caught up.";
  return parts.join(" · ");
}

export const ProcessingDialog = { Content };
