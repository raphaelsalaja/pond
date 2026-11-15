import type { QueryClient } from "@tanstack/react-query";
import type { DownloadHealthRow } from "@/features/downloads/health";
import { rescanLibrary, runNewAction } from "@/features/library/maintenance";
import { getAppRouter } from "@/shared/lib/app-router";
import { openSettings } from "@/shared/lib/open-settings";
import type { HealthCategoryId, HealthEntry } from "./categories";
import {
  recheckSaves,
  repairSaves,
  retryDownloads,
  retryPosters,
  retryProcessing,
} from "./use-library-health";

export interface HealthAction {
  id: string;
  label: string;
  count: number;
  primary: boolean;
  /** Leaves Settings, so the drill-down closes first. */
  navigates: boolean;
  /** Acts on the whole library at once, so it never appears on a single Save. */
  bulkOnly: boolean;
  run: () => void | Promise<void>;
}

function ids(entries: readonly HealthEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.saveId))];
}

export function healthActions(
  category: HealthCategoryId,
  entries: readonly HealthEntry[],
  context: { qc: QueryClient; downloads: readonly DownloadHealthRow[] },
): HealthAction[] {
  const { qc, downloads } = context;
  const action = (
    id: string,
    label: string,
    targets: readonly HealthEntry[],
    run: HealthAction["run"],
    options: {
      primary?: boolean;
      navigates?: boolean;
      bulkOnly?: boolean;
    } = {},
  ): HealthAction[] =>
    targets.length === 0
      ? []
      : [
          {
            id,
            label,
            count: ids(targets).length,
            primary: options.primary ?? false,
            navigates: options.navigates ?? false,
            bulkOnly: options.bulkOnly ?? false,
            run,
          },
        ];
  switch (category) {
    case "originals":
    case "previews":
    case "records":
    case "file-names": {
      const repairable = entries.filter((entry) => entry.repair != null);
      const kind = repairable[0]?.repair;
      return [
        ...(kind
          ? action(
              "repair",
              "Repair",
              repairable,
              () => repairSaves(qc, kind, ids(repairable)),
              { primary: true },
            )
          : []),
        ...action("recheck", "Recheck", entries, () =>
          recheckSaves(qc, ids(entries)),
        ),
      ];
    }
    case "index":
      return action(
        "rescan",
        "Rescan Library",
        entries.filter((entry) => entry.resolution === "repair"),
        () => runNewAction(rescanLibrary),
        { primary: true, bulkOnly: true },
      );
    case "posters": {
      const failed = entries.filter((entry) => entry.status === "failed");
      return [
        ...action(
          "retry",
          "Retry",
          failed,
          () => retryPosters(qc, ids(failed)),
          { primary: true },
        ),
        ...action("recheck", "Recheck", entries, () =>
          recheckSaves(qc, ids(entries)),
        ),
      ];
    }
    case "processing":
      return [
        ...action("retry", "Retry All", entries, retryProcessing, {
          primary: true,
          bulkOnly: true,
        }),
        ...action(
          "open-processing",
          "Open Processing",
          entries,
          () => openSettings("processing"),
          { navigates: true },
        ),
      ];
    case "downloads": {
      const retryable = entries.filter((entry) => entry.resolution === "retry");
      return [
        ...action(
          "retry",
          "Retry",
          retryable,
          () => retryDownloads(downloads, ids(retryable)),
          { primary: true },
        ),
        ...action(
          "open-downloads",
          "Open Downloads",
          entries,
          () => {
            getAppRouter()?.history.push("/downloads");
          },
          { navigates: true },
        ),
      ];
    }
  }
}
