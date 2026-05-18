import {
  IconMediaPauseOutline18,
  IconMediaPlayOutline18,
  IconMediaSkipToEndOutline18,
  IconMediaStopOutline18,
  IconOpenInBrowserOutline18,
  IconRefreshClockwiseOutline18,
  IconStackOutline18,
  IconTrashXmarkOutline18,
  IconTriangleWarningOutline18,
} from "@pond/icons/outline/18";
import { type Op, SOURCES } from "@pond/schema/db";
import { AlertDialog, Button, Dialog, useToast } from "@pond/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSourceLabel, SourceBadge } from "@/components/source-badge";
import { optimistic } from "@/pool/bootstrap";
import { pool, subscribeToAll } from "@/pool/pool";
import type {
  PipelineMetricsWire,
  ProcessingProgressWire,
} from "../../../../preload";
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
  stageTaskId: string | null;
  stageStatus: "pending" | "running" | "done" | "failed" | "blocked" | null;
  lastError: string | null;
  lastErrorName: string | null;
  lastErrorAt: string | null;
  nextRunAt: string | null;
  attempts: number;
  maxAttempts: number;
  ingestStartedAt: string | null;
}

interface ProcessingDetailsPayload {
  rows: ProcessingDetail[];
  truncated: number;
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

const STAGE_SUBJECTS: Record<Op, string> = {
  harvest_metadata: "metadata",
  capture_tweet: "tweet",
  fetch_blobs: "media",
  fetch_video_ytdlp: "video",
  ensure_poster: "thumbnail",
  fetch_avatar: "avatar",
  finalize: "save",
};

/* Map the raw `Error.name` (already extracted on the server side) to
 * the plain-English copy users see in the failed list. `short` shows
 * inline. The raw `${name}: ${message}` blob still rides along in the
 * row's tooltip so we don't lose info for bug reports. */
interface ErrorExplain {
  short: string;
  tone: "danger" | "warn" | "muted";
  hint?: string;
}

function explainTaskError(
  errorName: string | null,
  rawError: string | null,
  source: string,
  stageOp: Op | null,
): ErrorExplain {
  const subject = stageOp ? STAGE_SUBJECTS[stageOp] : "save";
  const sourceLabel = getSourceLabel(source);
  switch (errorName) {
    case "TerminalError":
      return {
        short: `${sourceLabel} didn't return ${subject} for this URL.`,
        tone: "warn",
        hint: "The post may be deleted, private, or unsupported. Opening the URL usually confirms which.",
      };
    case "UnsupportedError":
      return {
        short: `${sourceLabel} doesn't support this URL yet.`,
        tone: "muted",
      };
    case "AuthRequiredError":
      return {
        short: `Sign in to ${sourceLabel} to keep ingesting.`,
        tone: "danger",
        hint: "Open Settings → Sources to reconnect. Blocked tasks resume automatically once you're signed in.",
      };
    case "RateLimitedError":
      return {
        short: `${sourceLabel} rate-limited this fetch.`,
        tone: "warn",
        hint: "Will retry once the rate window resets.",
      };
    case "GeoRestrictedError":
      return {
        short: `${sourceLabel} blocks this region.`,
        tone: "muted",
      };
    case "TransientError":
      return {
        short: `Network blip while fetching ${subject}.`,
        tone: "warn",
        hint: "Usually self-heals on retry.",
      };
    case "WorkerWatchdogError":
      return {
        short: `Worker took too long and was killed.`,
        tone: "warn",
        hint: "Often happens when the host is slow. Retry will start fresh.",
      };
    case "FinalizeIncompleteError":
      return {
        short: `Missing some required fields after capture.`,
        tone: "warn",
        hint: "The metadata fetch will get another swing automatically.",
      };
    default:
      return {
        short: rawError ?? "Something went wrong.",
        tone: "danger",
      };
  }
}

function formatRelative(now: number, iso: string | null): string | null {
  if (!iso) return null;
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) return null;
  const delta = ts - now;
  const abs = Math.abs(delta);
  const sec = Math.round(abs / 1000);
  if (sec < 45) {
    return delta >= 0 ? `in <1m` : `<1m ago`;
  }
  const min = Math.round(sec / 60);
  if (min < 60) {
    return delta >= 0 ? `in ${min}m` : `${min}m ago`;
  }
  const hr = Math.round(min / 60);
  if (hr < 36) {
    return delta >= 0 ? `in ${hr}h` : `${hr}h ago`;
  }
  const day = Math.round(hr / 24);
  return delta >= 0 ? `in ${day}d` : `${day}d ago`;
}

function describeGate(
  reason: "cooldown" | "breaker",
  until: number,
  now: number,
  sourceLabel: string,
): { short: string; long: string } {
  const rel = formatRelative(now, new Date(until).toISOString());
  if (reason === "cooldown") {
    return {
      short: `${sourceLabel} rate-limited`,
      long: `${sourceLabel} hit a rate limit. New fetches resume ${rel ?? "shortly"}.`,
    };
  }
  return {
    short: `${sourceLabel} paused`,
    long: `${sourceLabel} hit several failures in a row, so the circuit breaker is holding new fetches until ${rel ?? "soon"} to avoid stampeding the host.`,
  };
}

type Selection =
  | { kind: "all" }
  | { kind: "source"; source: string }
  | { kind: "failed" };

interface ContentProps {
  open: boolean;
  /* Live counts owned by the trigger button. Passed in so the dialog
   * can auto-close itself when both hit zero without each consumer
   * needing its own subscription. */
  ingestingCount: number;
  failedCount: number;
  onClose: () => void;
}

/* Trailing debounce — coalesce burst refresh notifications from the
 * pool (one per save mutation × N saves during a sync) into a single
 * IPC round-trip. 150 ms keeps the UI feeling live while smoothing
 * 100-mutation bursts down to a couple of fetches. */
const REFRESH_DEBOUNCE_MS = 150;
/* Cadence for the metrics poll. The metrics endpoint is a cheap
 * in-memory snapshot; 2 s is plenty to drive the chip animations
 * without spamming IPC. */
const METRICS_POLL_MS = 2_000;

function Content({ open, ingestingCount, failedCount, onClose }: ContentProps) {
  const [payload, setPayload] = useState<ProcessingDetailsPayload | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessingProgressWire | null>(null);
  const [selection, setSelection] = useState<Selection>({ kind: "all" });
  const [metrics, setMetrics] = useState<PipelineMetricsWire | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  /* A renderer-only clock so relative timestamps ("2m ago", "in 30s")
   * stay fresh without subscribing every row to its own setInterval.
   * One tick every 15s is plenty — finer than that and we're just
   * burning paints to nudge rounded labels by a second. */
  const [now, setNow] = useState(() => Date.now());
  const toast = useToast();

  const refresh = useCallback(async () => {
    const next = (await window.pond.query(
      "saves.processingDetails",
    )) as ProcessingDetailsPayload;
    setPayload(next);
  }, []);

  /* Debounced trigger — re-uses one timer for every notification while
   * the dialog is open. Cleared on close so the IPC settles. */
  const refreshTimer = useRef<number | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current !== null) {
      window.clearTimeout(refreshTimer.current);
    }
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null;
      void refresh();
    }, REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    void refresh();
    /* The pool fires `subscribeToAll` on every save mutation, which
     * happens whenever a task moves status. Piggyback that for live
     * dialog updates — debounced so a 100-save backfill doesn't
     * trigger 100 IPC calls in quick succession. */
    const off = subscribeToAll(() => {
      scheduleRefresh();
    });
    return () => {
      off();
      if (refreshTimer.current !== null) {
        window.clearTimeout(refreshTimer.current);
        refreshTimer.current = null;
      }
    };
  }, [open, refresh, scheduleRefresh]);

  useEffect(() => {
    if (!open) return;
    const off = window.pond.onProcessingProgress((status) => {
      setProgress(status);
      scheduleRefresh();
    });
    return off;
  }, [open, scheduleRefresh]);

  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, [open]);

  /* Pipeline metrics live in main-process memory; pull them on a
   * lightweight interval while the dialog is open. */
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const tick = async () => {
      const next = (await window.pond.query(
        "pipeline.metrics",
      )) as PipelineMetricsWire;
      if (!cancelled) setMetrics(next);
    };
    void tick();
    const handle = window.setInterval(tick, METRICS_POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(handle);
    };
  }, [open]);

  /* Auto-close once everything's settled. Use the live pool counts
   * rather than the in-flight details fetch so we don't race a stale
   * snapshot. */
  useEffect(() => {
    if (!open) return;
    if (ingestingCount === 0 && failedCount === 0) onClose();
  }, [open, ingestingCount, failedCount, onClose]);

  useEffect(() => {
    if (open) setSelection({ kind: "all" });
  }, [open]);

  const rows = payload?.rows ?? [];
  const truncated = payload?.truncated ?? 0;

  const counts = useMemo(() => {
    const bySource = new Map<string, { ingesting: number; failed: number }>();
    let totalIngesting = 0;
    let totalFailed = 0;
    for (const row of rows) {
      const entry = bySource.get(row.source) ?? { ingesting: 0, failed: 0 };
      if (row.status === "ingesting") {
        entry.ingesting += 1;
        totalIngesting += 1;
      } else {
        entry.failed += 1;
        totalFailed += 1;
      }
      bySource.set(row.source, entry);
    }
    return { bySource, totalIngesting, totalFailed };
  }, [rows]);

  const railSources = useMemo(() => {
    const known = SOURCES.filter((s) => counts.bySource.has(s));
    const knownSet = new Set<string>(SOURCES);
    const unknown = [...counts.bySource.keys()]
      .filter((s) => !knownSet.has(s))
      .sort();
    return [...known, ...unknown];
  }, [counts.bySource]);

  const pausedSourceReasons = useMemo(() => {
    const map = new Map<string, "cooldown" | "breaker">();
    for (const entry of metrics?.pausedSources ?? []) {
      map.set(entry.source, entry.reason);
    }
    return map;
  }, [metrics?.pausedSources]);

  /* Fall back to All when the active source/group disappears (e.g.
   * the last failed item retried while Failed was selected). */
  useEffect(() => {
    if (selection.kind === "source" && !counts.bySource.has(selection.source)) {
      setSelection({ kind: "all" });
    } else if (selection.kind === "failed" && counts.totalFailed === 0) {
      setSelection({ kind: "all" });
    }
  }, [selection, counts]);

  const visibleRows = useMemo(() => {
    if (selection.kind === "all") return rows;
    if (selection.kind === "failed") {
      return rows.filter((r) => r.status === "failed");
    }
    return rows.filter((r) => r.source === selection.source);
  }, [rows, selection]);

  const visibleIngesting = visibleRows.filter((r) => r.status === "ingesting");
  const visibleFailed = visibleRows.filter((r) => r.status === "failed");

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

  const handleSkipStage = useCallback(
    async (row: ProcessingDetail) => {
      if (!row.stageTaskId) return;
      setBusyId(row.id);
      try {
        const res = (await window.pond.query("tasks.skip", {
          taskId: row.stageTaskId,
          reason: "user:skip-stage",
        })) as { ok: boolean; reason?: string };
        if (!res.ok) {
          toast.add({
            title: "Couldn't skip",
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

  const handleCancelRetryAll = useCallback(async () => {
    await window.pond.query("saves.cancelRetryAllFailed");
  }, []);

  const handleTogglePause = useCallback(async () => {
    const target = metrics?.paused ? "pipeline.resume" : "pipeline.pause";
    const res = (await window.pond.query(target)) as {
      ok: boolean;
      paused: boolean;
    };
    if (res.ok) {
      setMetrics((prev) => (prev ? { ...prev, paused: res.paused } : prev));
    }
  }, [metrics?.paused]);

  /* "Clear" scope follows whatever the rail is showing. Failed view
   * trashes only failed saves; a source view trashes that source's
   * queue (both ingesting + failed); "All" trashes the whole queue.
   * The count drives the button label so the user knows exactly what
   * they're about to delete. */
  const clearScope = useMemo(() => {
    if (selection.kind === "failed") {
      return {
        label: "Clear failed",
        count: counts.totalFailed,
        params: { statuses: ["failed"] as const },
        confirmTitle: "Clear failed saves?",
        confirmBody: `Permanently remove ${counts.totalFailed} failed save${counts.totalFailed === 1 ? "" : "s"} from the queue. Undo with ⌘Z.`,
      };
    }
    if (selection.kind === "source") {
      const entry = counts.bySource.get(selection.source);
      const total = (entry?.ingesting ?? 0) + (entry?.failed ?? 0);
      const label = getSourceLabel(selection.source);
      return {
        label: `Clear ${label}`,
        count: total,
        params: {
          source: selection.source,
          statuses: ["ingesting", "failed"] as const,
        },
        confirmTitle: `Clear ${label} queue?`,
        confirmBody: `Permanently remove ${total} ${label} save${total === 1 ? "" : "s"}, including anything still processing. Undo with ⌘Z.`,
      };
    }
    return {
      label: "Clear queue",
      count: counts.totalIngesting + counts.totalFailed,
      params: { statuses: ["ingesting", "failed"] as const },
      confirmTitle: "Clear the whole queue?",
      confirmBody: `Permanently remove every processing and failed save (${counts.totalIngesting + counts.totalFailed}). Undo with ⌘Z.`,
    };
  }, [selection, counts]);

  const handleClearQueue = useCallback(async () => {
    setClearing(true);
    try {
      const res = (await window.pond.query("saves.clearQueue", {
        ...(("source" in clearScope.params
          ? { source: clearScope.params.source }
          : {}) as { source?: string }),
        statuses: [...clearScope.params.statuses],
      })) as { ok: boolean; count: number };
      if (res.ok) {
        toast.add({
          title:
            res.count === 0
              ? "Nothing to clear"
              : `Cleared ${res.count} save${res.count === 1 ? "" : "s"}`,
          type: "success",
        });
      }
    } finally {
      setClearing(false);
      setConfirmClear(false);
      void refresh();
    }
  }, [clearScope, refresh, toast]);

  const backfillRunning = progress?.state === "running";
  const backfillMessage = progress?.message;
  const paused = metrics?.paused === true;
  const inflightTotal = metrics?.inflightGlobal ?? 0;
  const queuedTotal = Math.max(0, counts.totalIngesting - inflightTotal);

  return (
    <Dialog.Content className={styles.dialog}>
      <aside className={styles.rail}>
        <RailRow
          icon={<IconStackOutline18 width="0.95em" height="0.95em" />}
          label="All"
          count={counts.totalIngesting + counts.totalFailed}
          selected={selection.kind === "all"}
          onSelect={() => setSelection({ kind: "all" })}
        />
        {railSources.map((source) => {
          const entry = counts.bySource.get(source);
          if (!entry) return null;
          return (
            <RailRow
              key={source}
              badge={<SourceBadge.Root source={source} data-size="sm" />}
              label={getSourceLabel(source)}
              count={entry.ingesting + entry.failed}
              gate={pausedSourceReasons.get(source) ?? null}
              selected={
                selection.kind === "source" && selection.source === source
              }
              onSelect={() => setSelection({ kind: "source", source })}
            />
          );
        })}
        {counts.totalFailed > 0 ? (
          <>
            <hr className={styles["rail-divider"]} />
            <RailRow
              icon={
                <IconTriangleWarningOutline18 width="0.95em" height="0.95em" />
              }
              label="Failed"
              count={counts.totalFailed}
              tone="danger"
              selected={selection.kind === "failed"}
              onSelect={() => setSelection({ kind: "failed" })}
            />
          </>
        ) : null}
      </aside>

      <div className={styles.pane}>
        <header className={styles.header}>
          <Dialog.Title>{paneTitle(selection)}</Dialog.Title>
          <Dialog.Description>
            {describeCounts(visibleIngesting.length, visibleFailed.length)}
          </Dialog.Description>
          <div className={styles["header-actions"]}>
            <button
              type="button"
              className={styles["icon-button"]}
              data-active={paused ? "true" : undefined}
              onClick={handleTogglePause}
              title={paused ? "Resume processing" : "Pause processing"}
              aria-label={paused ? "Resume processing" : "Pause processing"}
            >
              {paused ? (
                <IconMediaPlayOutline18 width="0.95em" height="0.95em" />
              ) : (
                <IconMediaPauseOutline18 width="0.95em" height="0.95em" />
              )}
            </button>
            {backfillRunning ? (
              <button
                type="button"
                className={styles["retry-all"]}
                data-variant="stop"
                onClick={handleCancelRetryAll}
                title="Stop the in-progress retry"
              >
                <IconMediaStopOutline18 width="0.85em" height="0.85em" />
                <span>Stop retrying</span>
              </button>
            ) : counts.totalFailed > 0 ? (
              <button
                type="button"
                className={styles["retry-all"]}
                onClick={handleRetryAll}
              >
                <IconRefreshClockwiseOutline18 width="0.85em" height="0.85em" />
                <span>{`Retry all failed (${counts.totalFailed})`}</span>
              </button>
            ) : null}
            {clearScope.count > 0 ? (
              <button
                type="button"
                className={styles["retry-all"]}
                data-variant="danger"
                onClick={() => setConfirmClear(true)}
                title={`${clearScope.label} (moves ${clearScope.count} to trash)`}
              >
                <IconTrashXmarkOutline18 width="0.85em" height="0.85em" />
                <span>{`${clearScope.label} (${clearScope.count})`}</span>
              </button>
            ) : null}
          </div>
        </header>

        {(metrics && (inflightTotal > 0 || queuedTotal > 0 || paused)) ||
        truncated > 0 ? (
          <div className={styles.chips}>
            {paused ? (
              <span
                className={styles.chip}
                data-tone="warn"
                title="The reconciler is paused — no new tasks will dispatch."
              >
                Paused
              </span>
            ) : null}
            {inflightTotal > 0 ? (
              <span className={styles.chip}>{inflightTotal} active</span>
            ) : null}
            {queuedTotal > 0 ? (
              <span className={styles.chip}>{queuedTotal} queued</span>
            ) : null}
            {(metrics?.pausedSources ?? []).map((entry) => {
              const desc = describeGate(
                entry.reason,
                entry.until,
                now,
                getSourceLabel(entry.source),
              );
              return (
                <span
                  key={entry.source}
                  className={styles.chip}
                  data-tone={entry.reason === "breaker" ? "danger" : "warn"}
                  title={desc.long}
                >
                  {desc.short}
                </span>
              );
            })}
            {truncated > 0 ? (
              <span
                className={styles.chip}
                data-tone="muted"
                title="The dialog caps at 500 rows — clear or retry to see the rest."
              >
                +{truncated} more
              </span>
            ) : null}
          </div>
        ) : null}

        {selection.kind === "source" &&
        pausedSourceReasons.has(selection.source) ? (
          <p className={styles.notice} data-tone="warn">
            {
              describeGate(
                pausedSourceReasons.get(selection.source) ?? "cooldown",
                metrics?.pausedSources.find(
                  (e) => e.source === selection.source,
                )?.until ?? now,
                now,
                getSourceLabel(selection.source),
              ).long
            }
          </p>
        ) : null}

        {paused && visibleRows.length === 0 ? (
          <p className={styles.notice} data-tone="warn">
            Processing is paused. Hit play to resume.
          </p>
        ) : null}

        {backfillRunning && backfillMessage ? (
          <p className={styles["backfill-status"]}>{backfillMessage}</p>
        ) : null}

        <div className={styles.scroll}>
          {visibleIngesting.length > 0 ? (
            <section className={styles.section}>
              <h3 className={styles["section-title"]}>
                Ingesting{" "}
                <span className={styles["section-count"]}>
                  {visibleIngesting.length}
                </span>
              </h3>
              <ul className={styles.list}>
                {visibleIngesting.map((row) => {
                  const stage = describeIngestingStage(row, now);
                  return (
                    <li
                      key={row.id}
                      className={styles.row}
                      data-status="ingesting"
                    >
                      <SourceBadge.Root source={row.source} data-size="sm" />
                      <div className={styles.body}>
                        <span className={styles.title} title={row.url}>
                          {row.title?.trim() || displayUrl(row.url)}
                        </span>
                        <span
                          className={styles.stage}
                          data-tone={stage.tone}
                          title={stage.hint}
                        >
                          {stage.label}
                        </span>
                      </div>
                      <ProgressBar
                        done={row.progress.done}
                        total={row.progress.total}
                      />
                      {row.stageTaskId ? (
                        <button
                          type="button"
                          className={styles["row-button"]}
                          aria-label="Skip current step"
                          title="Skip current step (marks save failed)"
                          onClick={() => handleSkipStage(row)}
                          disabled={busyId === row.id}
                        >
                          <IconMediaSkipToEndOutline18
                            width="0.95em"
                            height="0.95em"
                          />
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {visibleFailed.length > 0 ? (
            <section className={styles.section}>
              <h3 className={styles["section-title"]}>
                Failed{" "}
                <span className={styles["section-count"]}>
                  {visibleFailed.length}
                </span>
              </h3>
              <ul className={styles.list}>
                {visibleFailed.map((row) => {
                  const explain = explainTaskError(
                    row.lastErrorName,
                    row.lastError,
                    row.source,
                    row.stageOp,
                  );
                  const dwell = formatRelative(now, row.lastErrorAt);
                  const detailParts = [explain.hint, row.lastError].filter(
                    Boolean,
                  );
                  return (
                    <li
                      key={row.id}
                      className={styles.row}
                      data-status="failed"
                    >
                      <SourceBadge.Root source={row.source} data-size="sm" />
                      <div className={styles.body}>
                        <span className={styles.title} title={row.url}>
                          {row.title?.trim() || displayUrl(row.url)}
                        </span>
                        <span
                          className={styles.error}
                          data-tone={explain.tone}
                          title={detailParts.join("\n\n") || undefined}
                        >
                          {explain.short}
                          {dwell ? (
                            <span className={styles["error-meta"]}>
                              {" · "}
                              {dwell}
                              {row.stageOp
                                ? ` · ${STAGE_LABELS[row.stageOp]}`
                                : ""}
                            </span>
                          ) : null}
                        </span>
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
                          <IconTrashXmarkOutline18
                            width="0.95em"
                            height="0.95em"
                          />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {payload && visibleRows.length === 0
            ? renderEmpty(selection, rows.length === 0)
            : null}
        </div>
      </div>

      <AlertDialog.Root open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialog.Content>
          <AlertDialog.Title>{clearScope.confirmTitle}</AlertDialog.Title>
          <AlertDialog.Description>
            {clearScope.confirmBody}
          </AlertDialog.Description>
          <AlertDialog.Actions>
            <AlertDialog.Close
              render={<Button variant="ghost">Cancel</Button>}
            />
            <AlertDialog.Close
              render={
                <Button
                  variant="danger"
                  disabled={clearing}
                  onClick={(e) => {
                    e.preventDefault();
                    void handleClearQueue();
                  }}
                >
                  Clear
                </Button>
              }
            />
          </AlertDialog.Actions>
        </AlertDialog.Content>
      </AlertDialog.Root>
    </Dialog.Content>
  );
}

interface RailRowProps {
  label: string;
  count: number;
  selected: boolean;
  onSelect: () => void;
  badge?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "danger";
  gate?: "cooldown" | "breaker" | null;
}

function RailRow({
  label,
  count,
  selected,
  onSelect,
  badge,
  icon,
  tone,
  gate,
}: RailRowProps) {
  return (
    <button
      type="button"
      className={styles["rail-row"]}
      data-selected={selected ? "true" : undefined}
      data-tone={tone}
      data-gate={gate ?? undefined}
      onClick={onSelect}
      title={
        gate === "breaker"
          ? `${label}: paused (circuit breaker)`
          : gate === "cooldown"
            ? `${label}: waiting (rate limit)`
            : undefined
      }
    >
      {badge ?? <span className={styles["rail-icon"]}>{icon}</span>}
      <span className={styles["rail-label"]}>{label}</span>
      <span className={styles["rail-count"]}>{count}</span>
    </button>
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

function describeIngestingStage(
  row: ProcessingDetail,
  now: number,
): { label: string; tone?: "warn" | "muted"; hint?: string } {
  if (!row.stageOp) {
    return { label: "Queued — waiting for a worker", tone: "muted" };
  }
  const baseLabel = STAGE_LABELS[row.stageOp];
  if (row.stageStatus === "running") {
    const dwell = formatRelative(now, row.ingestStartedAt);
    return {
      label: dwell
        ? `${baseLabel} — running ${dwell}`
        : `${baseLabel} — running`,
      hint:
        row.attempts > 1
          ? `Attempt ${row.attempts} of ${row.maxAttempts}.`
          : undefined,
    };
  }
  if (row.stageStatus === "blocked") {
    return {
      label: `${baseLabel} — blocked`,
      tone: "warn",
      hint:
        row.lastError ??
        "Pipeline blocked this step. Often clears once auth or rate limits resolve.",
    };
  }
  if (row.stageStatus === "pending") {
    const rel = formatRelative(now, row.nextRunAt);
    if (row.attempts > 0) {
      return {
        label: rel
          ? `${baseLabel} — retrying ${rel}`
          : `${baseLabel} — retrying soon`,
        tone: "warn",
        hint:
          row.maxAttempts > 0
            ? `Attempt ${row.attempts + 1} of ${row.maxAttempts}.`
            : undefined,
      };
    }
    return {
      label: rel ? `${baseLabel} — starts ${rel}` : `${baseLabel} — queued`,
      tone: "muted",
    };
  }
  return { label: baseLabel };
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

function paneTitle(selection: Selection): string {
  if (selection.kind === "all") return "Processing";
  if (selection.kind === "failed") return "Failed";
  return getSourceLabel(selection.source);
}

function renderEmpty(selection: Selection, totallyEmpty: boolean) {
  if (totallyEmpty) {
    return <p className={styles.empty}>Nothing to show — closing.</p>;
  }
  if (selection.kind === "source") {
    return (
      <p className={styles.empty}>
        Nothing left in {getSourceLabel(selection.source)}.
      </p>
    );
  }
  if (selection.kind === "failed") {
    return (
      <p className={styles.empty}>
        Nothing failed right now. Anything that errors out will show up here
        with a plain-English explanation.
      </p>
    );
  }
  return <p className={styles.empty}>Nothing to show.</p>;
}

export const ProcessingDialog = { Content };
