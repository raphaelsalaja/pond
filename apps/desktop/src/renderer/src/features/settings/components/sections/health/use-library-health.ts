import { Dialog } from "@pond/ui";
import type {
  LibraryHealthJob,
  LibraryHealthOverview,
} from "@shared/library-health-contracts";
import type { LibraryRepairKind } from "@shared/library-repair-contracts";
import {
  type QueryClient,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import {
  canRetryDownload,
  type DownloadHealthRow,
  retryDownloadRows,
  useDownloadHealth,
} from "@/features/downloads/health";
import { useEnrichmentStatus } from "@/features/enrichment/status";
import { openLibraryRepair } from "@/features/library/repair";
import { savesStore } from "@/features/saves/pool";
import { errorCopy } from "@/shared/lib/error-copy";
import { formatPlural } from "@/shared/lib/format";
import { THIS_DEVICE } from "@/shared/lib/platform";
import { notify } from "@/shared/lib/toast";
import { buildHealthCategories } from "./categories";

export const OVERVIEW_KEY = ["libraryHealth.overview"];

/** Main caps each request so a recheck never blocks the library for long. */
const RECHECK_BATCH = 500;

/** Saves whose posters were retried, rechecked once the warmer lets go of them. */
const awaitingPosters = new Set<string>();

function title(saveId: string): string | null {
  return savesStore.state.byId.get(saveId)?.title?.trim() || null;
}

export function useHealthOverview() {
  return useQuery({
    queryKey: OVERVIEW_KEY,
    queryFn: () => window.pond.query("libraryHealth.overview", {}),
    refetchInterval: (query) =>
      query.state.data?.job?.status === "running" ? 500 : 5_000,
  });
}

export function useHealthCategories() {
  const overview = useHealthOverview();
  const downloads = useDownloadHealth();
  const enrichment = useEnrichmentStatus();
  const missingIds = useMemo(
    () => new Set(enrichment.missingOriginals.map((save) => save.id)),
    [enrichment.missingOriginals],
  );
  const categories = useMemo(
    () =>
      buildHealthCategories({
        overview: overview.data ?? null,
        downloads: downloads.rows,
        enrichment: {
          inflight: enrichment.inflight,
          failures: enrichment.failures,
          missingIds,
        },
        title,
        device: THIS_DEVICE,
      }),
    [
      overview.data,
      downloads.rows,
      enrichment.inflight,
      enrichment.failures,
      missingIds,
    ],
  );
  return {
    categories,
    overview: overview.data ?? null,
    downloads: downloads.rows,
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
  kind: LibraryRepairKind,
  saveIds: readonly string[],
): void {
  const unique = [...new Set(saveIds)];
  openLibraryRepair(kind, {
    saveIds: unique,
    onClosed: () => void recheckSaves(qc, unique),
  });
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
