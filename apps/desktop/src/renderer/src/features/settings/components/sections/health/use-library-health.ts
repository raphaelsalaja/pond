import { Dialog } from "@pond/ui";
import type {
  LibraryHealthJob,
  LibraryHealthOverview,
} from "@shared/library-health-contracts";
import type {
  LibraryRepairJob,
  LibraryRepairKind,
} from "@shared/library-repair-contracts";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { useEffect, useMemo } from "react";
import {
  canRetryDownload,
  type DownloadHealthRow,
  retryDownloadRows,
  useDownloadHealth,
} from "@/features/downloads/health";
import { useEnrichmentStatus } from "@/features/enrichment/status";
import { savesStore } from "@/features/saves/pool";
import { errorCopy } from "@/shared/lib/error-copy";
import { formatNumber, formatPlural } from "@/shared/lib/format";
import { THIS_DEVICE } from "@/shared/lib/platform";
import {
  notify,
  TOAST_TIMEOUT_MS,
  updateNotification,
} from "@/shared/lib/toast";
import {
  buildHealthCategories,
  type HealthCategory,
  type HealthCategoryId,
  healthTotals,
} from "./categories";

const OVERVIEW_KEY = ["libraryHealth.overview"];

/** Main caps each request so a recheck never blocks the library for long. */
const RECHECK_BATCH = 500;

const REPAIR_POLL_MS = 500;

/** A repair that makes no progress for this long has stalled in main. */
const REPAIR_STALL_MS = 120_000;

const SAVES = { one: "Save", other: "Saves" };

const REPAIR_NOUNS = {
  thumbnails: "thumbnails",
  "physical-file-names": "file names",
  "invalid-content": "original files",
  "save-metadata": "Save records",
} satisfies Record<LibraryRepairKind, string>;

/** Saves whose posters were retried, rechecked once the warmer lets go of them. */
const awaitingPosters = new Set<string>();

const running = new Store<ReadonlySet<HealthCategoryId>>(new Set());

export function useCategoryRunning(id: HealthCategoryId | null): boolean {
  return useSelector(running, (state) => id != null && state.has(id));
}

/** One run per category, so a second click never starts a duplicate repair. */
export async function inBackground(
  id: HealthCategoryId,
  run: () => Promise<void>,
): Promise<void> {
  if (running.state.has(id)) return;
  running.setState((state) => new Set(state).add(id));
  try {
    await run();
  } finally {
    running.setState((state) => {
      const next = new Set(state);
      next.delete(id);
      return next;
    });
  }
}

function title(saveId: string): string | null {
  return savesStore.state.byId.get(saveId)?.title?.trim() || null;
}

function useHealthOverview(idleMs = 5_000) {
  return useQuery({
    queryKey: OVERVIEW_KEY,
    queryFn: () => window.pond.query("libraryHealth.overview", {}),
    refetchInterval: (query) =>
      query.state.data?.job?.status === "running" ? 500 : idleMs,
  });
}

function useCategories(
  overview: LibraryHealthOverview | null,
  downloads: readonly DownloadHealthRow[],
): HealthCategory[] {
  const enrichment = useEnrichmentStatus();
  const missingIds = useMemo(
    () => new Set(enrichment.missingOriginals.map((save) => save.id)),
    [enrichment.missingOriginals],
  );
  return useMemo(
    () =>
      buildHealthCategories({
        overview,
        downloads,
        enrichment: {
          inflight: enrichment.inflight,
          failures: enrichment.failures,
          missingIds,
        },
        title,
        device: THIS_DEVICE,
      }),
    [overview, downloads, enrichment.inflight, enrichment.failures, missingIds],
  );
}

export function useHealthCategories() {
  const overview = useHealthOverview();
  const downloads = useDownloadHealth();
  const categories = useCategories(overview.data ?? null, downloads.rows);
  return {
    categories,
    overview: overview.data ?? null,
    downloads: downloads.rows,
    status: overview.status,
    retry: () => void overview.refetch(),
  };
}

const NO_DOWNLOADS: readonly DownloadHealthRow[] = [];

/** Drives an always-mounted indicator: polls once a minute and leaves out downloads, which would subscribe it to every Save. */
export function useHealthSignal() {
  const overview = useHealthOverview(60_000);
  const categories = useCategories(overview.data ?? null, NO_DOWNLOADS);
  const totals = healthTotals(categories);
  const job = overview.data?.job ?? null;
  return {
    categories,
    loaded: overview.data != null,
    checking: job?.status === "running" ? job : null,
    attention: totals.attention > 0,
    working: job?.status === "running" || totals.progress > 0,
  };
}

/** Rechecks retried posters once the warmer has finished with them, so Health only reports them fixed after a check. */
export function usePosterVerification(): void {
  const qc = useQueryClient();
  const overview = useHealthOverview();
  const media = overview.data?.media;
  useEffect(() => {
    if (!media || awaitingPosters.size === 0) return;
    const active = new Set(media.activeSaveIds);
    const settled = [...awaitingPosters].filter((id) => !active.has(id));
    if (settled.length === 0 || media.state === "indexing") return;
    for (const id of settled) awaitingPosters.delete(id);
    void recheckSaves(qc, settled);
  }, [media, qc]);
}

export async function startCheck(qc: QueryClient): Promise<void> {
  try {
    const job = await window.pond.query("libraryHealth.check", {});
    setJob(qc, job);
  } catch (cause) {
    notify({
      id: "library-health",
      title: "Couldn't check your library",
      description: errorCopy(cause, "Try again."),
    });
  }
}

export async function cancelCheck(qc: QueryClient): Promise<void> {
  const job = await window.pond.query("libraryHealth.cancel", {});
  if (job) setJob(qc, job);
}

function setJob(qc: QueryClient, job: LibraryHealthJob): void {
  qc.setQueryData<LibraryHealthOverview>(OVERVIEW_KEY, (current) =>
    current ? { ...current, job } : current,
  );
  void qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
}

export async function recheckSaves(
  qc: QueryClient,
  saveIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(saveIds)];
  try {
    for (let start = 0; start < unique.length; start += RECHECK_BATCH) {
      await window.pond.query("libraryHealth.recheck", {
        saveIds: unique.slice(start, start + RECHECK_BATCH),
      });
    }
  } catch (cause) {
    notify({
      id: "library-health",
      title: "Couldn't recheck these Saves",
      description: errorCopy(cause, "Try again."),
    });
  }
  await qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
}

export function repairSaves(
  qc: QueryClient,
  category: HealthCategoryId,
  kind: LibraryRepairKind,
  saveIds: readonly string[],
): Promise<void> {
  const unique = [...new Set(saveIds)];
  const start = () =>
    inBackground(category, () => repairInBackground(qc, kind, unique));
  if (kind !== "invalid-content") return start();
  Dialog.confirm({
    title: "Repair Original Files",
    description: `${formatPlural(unique.length, SAVES)} with missing or damaged files move to Trash. Restore the files from a backup first to keep them.`,
    confirmLabel: "Move to Trash",
    onConfirm: () => {
      void start();
    },
  });
  return Promise.resolve();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function followRepair(
  first: LibraryRepairJob,
  onProgress: (job: LibraryRepairJob) => void,
): Promise<LibraryRepairJob> {
  let job = first;
  let movedAt = Date.now();
  while (job.status === "queued" || job.status === "running") {
    await delay(REPAIR_POLL_MS);
    const next = await window.pond.query("libraryRepairs.get", { id: job.id });
    if (!next) throw new Error("Pond lost track of this repair. Try again.");
    if (next.status !== job.status || next.processed !== job.processed) {
      movedAt = Date.now();
    } else if (Date.now() - movedAt > REPAIR_STALL_MS) {
      void window.pond.query("libraryRepairs.cancel", { id: job.id });
      throw new Error("The repair stopped responding. Try again.");
    }
    job = next;
    onProgress(job);
  }
  if (job.status === "failed") {
    throw new Error(job.error ?? "The repair failed. Try again.");
  }
  return job;
}

async function repairInBackground(
  qc: QueryClient,
  kind: LibraryRepairKind,
  saveIds: readonly string[],
): Promise<void> {
  const noun = REPAIR_NOUNS[kind];
  const title = `Repairing ${noun}`;
  const id = notify({
    id: `library-health-repair-${kind}`,
    title,
    description: "Checking Saves",
    progress: { label: `${title} progress` },
    timeout: 0,
  });
  const progress = (job: LibraryRepairJob) => {
    if (job.total === 0) return;
    updateNotification({
      id,
      title,
      description: `${formatNumber(job.processed)} of ${formatPlural(job.total, SAVES)}`,
      progress: {
        label: `${title} progress`,
        value: job.processed,
        max: job.total,
      },
      timeout: 0,
    });
  };
  try {
    const preview = await followRepair(
      await window.pond.query("libraryRepairs.preview", {
        kind,
        saveIds: [...saveIds],
      }),
      progress,
    );
    const token = preview.preview?.token;
    if (!token || preview.preview?.issues.length === 0) {
      updateNotification({
        id,
        title: "Nothing to repair",
        timeout: TOAST_TIMEOUT_MS,
      });
    } else {
      const applied = await followRepair(
        await window.pond.query("libraryRepairs.apply", { token }),
        progress,
      );
      const skipped = applied.result?.skipped ?? 0;
      updateNotification({
        id,
        title: `Repaired ${formatPlural(applied.result?.repaired ?? 0, SAVES)}`,
        description:
          skipped > 0 ? `${formatNumber(skipped)} skipped.` : undefined,
        timeout: TOAST_TIMEOUT_MS,
      });
    }
  } catch (cause) {
    updateNotification({
      id,
      title: `Couldn't repair ${noun}`,
      description: errorCopy(cause, "Try again."),
      timeout: 5000,
    });
  }
  await recheckSaves(qc, saveIds);
}

export function retryPosters(
  qc: QueryClient,
  saveIds: readonly string[],
): void {
  const unique = [...new Set(saveIds)].slice(0, RECHECK_BATCH);
  Dialog.confirm({
    title: "Retry Posters",
    description: `Pond makes new posters for ${formatPlural(unique.length, { one: "Save", other: "Saves" })} now and writes them next to each video. Your videos don't change.`,
    confirmLabel: "Retry",
    onConfirm: async () => {
      try {
        await window.pond.query("libraryHealth.retryPosters", {
          saveIds: unique,
        });
        for (const id of unique) awaitingPosters.add(id);
      } catch (cause) {
        notify({
          id: "library-health",
          title: "Couldn't retry posters",
          description: errorCopy(cause, "Try again."),
        });
      }
      await qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    },
  });
}

export async function retryDownloads(
  rows: readonly DownloadHealthRow[],
  saveIds: readonly string[],
): Promise<void> {
  const ids = new Set(saveIds);
  await retryDownloadRows(
    rows
      .map((item) => item.row)
      .filter((row) => ids.has(row.saveId) && canRetryDownload(row)),
  );
}

export async function retryProcessing(): Promise<void> {
  const { runEnrichment } = await import("@/features/enrichment");
  runEnrichment();
}
