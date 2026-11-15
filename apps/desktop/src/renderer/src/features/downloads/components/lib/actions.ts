import { z } from "zod";
import {
  type DownloadRow,
  statusBucket,
  statusFeed,
} from "@/features/downloads/lib/status-feed";
import { downloadsSelection } from "@/features/downloads/state/downloads-selection";
import {
  invalidatePendingSaveHydration,
  pool,
  reloadSaves,
  trashSaves,
} from "@/features/saves/pool";
import { emitFeedback } from "@/shared/lib/sounds";
import { notify } from "@/shared/lib/toast";

const RetryResultSchema = z.object({ ok: z.boolean(), requeued: z.number() });
const SkipResultSchema = z.object({ ok: z.boolean(), skipped: z.number() });
const CancelResultSchema = z.object({ ok: z.boolean(), cancelled: z.number() });
const ClearUnfinishedResultSchema = z.object({
  changed: z.number().int().nonnegative(),
  ids: z.array(z.string()),
});
type ClearUnfinishedResult = z.infer<typeof ClearUnfinishedResultSchema>;

export function canSkipDownload(row: DownloadRow): boolean {
  return row.live && row.status !== "complete" && row.status !== "skipped";
}

export function canTrashDownload(row: DownloadRow): boolean {
  return row.live && row.status !== "complete";
}

export function canCancelDownload(row: DownloadRow): boolean {
  const bucket = statusBucket(row.status);
  return row.live && (bucket === "active" || bucket === "waiting");
}

export function canRetryDownload(row: DownloadRow): boolean {
  return row.status === "failed" || row.status === "dead";
}

function uniqueSaveIds(
  rows: readonly DownloadRow[],
  include: (row: DownloadRow) => boolean,
): string[] {
  return [...new Set(rows.filter(include).map((row) => row.saveId))];
}

export async function retryDownloadRows(
  rows: readonly DownloadRow[],
): Promise<boolean> {
  const ids = uniqueSaveIds(rows, canRetryDownload);
  if (ids.length === 0) return false;
  try {
    const result = RetryResultSchema.parse(
      await window.pond.query("saves.retryFailed", { ids }),
    );
    if (!result.ok || result.requeued === 0) throw new Error("retry failed");
    downloadsSelection.clear();
    return true;
  } catch {
    statusFeed.error("Retry failed items", "Couldn't retry failed items.");
    return false;
  }
}

export async function cancelDownloadRows(
  rows: readonly DownloadRow[],
): Promise<boolean> {
  const ids = uniqueSaveIds(rows, canCancelDownload);
  if (ids.length === 0) return false;
  try {
    const result = CancelResultSchema.parse(
      await window.pond.pipelineCancelSaves(ids),
    );
    if (!result.ok) throw new Error("cancel failed");
    downloadsSelection.clear();
    return result.cancelled > 0;
  } catch {
    statusFeed.error(
      "Cancel downloads",
      "Couldn't cancel these downloads. Try again.",
    );
    return false;
  }
}

export async function skipDownloadRows(
  rows: readonly DownloadRow[],
): Promise<boolean> {
  const ids = uniqueSaveIds(rows, canSkipDownload);
  if (ids.length === 0) return false;
  try {
    const result = SkipResultSchema.parse(
      await window.pond.query("saves.skipIngest", { ids }),
    );
    if (!result.ok || result.skipped === 0) throw new Error("skip failed");
    downloadsSelection.clear();
    return true;
  } catch {
    statusFeed.error(
      "Skip downloads",
      "Couldn't skip these downloads. Try again.",
    );
    return false;
  }
}

interface TrashNotificationDependencies {
  notify: typeof notify;
  undo: () => Promise<{ ok: boolean }>;
}

interface TrashDownloadDependencies extends TrashNotificationDependencies {
  trash: typeof trashSaves;
}

interface ClearUnfinishedDependencies extends TrashNotificationDependencies {
  clear: () => Promise<ClearUnfinishedResult>;
  invalidate: (ids: readonly string[]) => void;
  reconcile: (ids: readonly string[]) => void;
  reload: (ids: readonly string[]) => Promise<void>;
}

const TRASH_DOWNLOAD_DEPENDENCIES: TrashDownloadDependencies = {
  trash: trashSaves,
  notify,
  undo: () => window.pond.undo(),
};

const CLEAR_UNFINISHED_DEPENDENCIES: ClearUnfinishedDependencies = {
  notify,
  undo: () => window.pond.undo(),
  clear: async () =>
    ClearUnfinishedResultSchema.parse(
      await window.pond.query("downloads.clearUnfinished", {}),
    ),
  invalidate: invalidatePendingSaveHydration,
  reload: reloadSaves,
  reconcile: (ids) => {
    const deletedAt = Date.now();
    for (const id of ids) {
      const save = pool.get(id);
      if (save) pool.upsert({ ...save, deletedAt });
    }
    emitFeedback("saveDeletion");
  },
};

function reportUndoFailure(): void {
  statusFeed.error(
    "Undo move to Trash",
    "Couldn't restore these downloads. Try again.",
  );
}

function notifyTrashedDownloads(
  changed: number,
  dependencies: TrashNotificationDependencies,
  afterUndo?: () => Promise<void>,
): void {
  downloadsSelection.clear();
  dependencies.notify({
    id: "trash-downloads",
    title:
      changed === 1
        ? "Moved download to Trash"
        : `Moved ${changed} downloads to Trash`,
    action: {
      label: "Undo",
      onClick: () => {
        void dependencies
          .undo()
          .then(async (result) => {
            if (!result.ok) {
              reportUndoFailure();
              return;
            }
            await afterUndo?.();
          })
          .catch(reportUndoFailure);
      },
    },
  });
}

async function trashDownloadIds(
  ids: readonly string[],
  dependencies: TrashDownloadDependencies,
): Promise<boolean> {
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length === 0) return false;
  try {
    const { changed } = await dependencies.trash(uniqueIds);
    if (changed === 0) return false;
    notifyTrashedDownloads(changed, dependencies);
    return true;
  } catch {
    statusFeed.error(
      "Move to Trash",
      "Couldn't move these downloads to Trash. Try again.",
    );
    return false;
  }
}

export async function clearUnfinishedDownloads(
  dependencies = CLEAR_UNFINISHED_DEPENDENCIES,
): Promise<boolean> {
  try {
    const result = await dependencies.clear();
    if (result.changed === 0) return false;
    dependencies.invalidate(result.ids);
    dependencies.reconcile(result.ids);
    notifyTrashedDownloads(result.changed, dependencies, async () => {
      dependencies.invalidate(result.ids);
      await dependencies.reload(result.ids);
    });
    return true;
  } catch {
    statusFeed.error(
      "Move to Trash",
      "Couldn't move these downloads to Trash. Try again.",
    );
    return false;
  }
}

export function trashDownloadRows(
  rows: readonly DownloadRow[],
  dependencies = TRASH_DOWNLOAD_DEPENDENCIES,
): Promise<boolean> {
  return trashDownloadIds(uniqueSaveIds(rows, canTrashDownload), dependencies);
}
