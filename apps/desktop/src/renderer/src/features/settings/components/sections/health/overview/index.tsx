import {
  IconCircleCheck,
  IconCircleQuestion,
  IconCircleWarning,
} from "@pond/icons";
import { Button, Loader, Settings } from "@pond/ui";
import type { LibraryHealthOverview } from "@shared/library-health-contracts";
import { useQueryClient } from "@tanstack/react-query";
import {
  exportDebugReport,
  runNewAction,
} from "@/features/library/maintenance";
import { formatNumber, formatPlural } from "@/shared/lib/format";
import { relativeTimeFromMs } from "@/shared/lib/relative-time";
import { type HealthCategory, healthTotals } from "../categories";
import {
  cancelCheck,
  startCheck,
  useHealthCategories,
  usePosterVerification,
} from "../use-library-health";
import styles from "./styles.module.css";

const ISSUES = { one: "issue needs", other: "issues need" };

type OverviewState =
  | "loading"
  | "checking"
  | "attention"
  | "unchecked"
  | "ready";

function overviewCopy(
  overview: LibraryHealthOverview | null,
  categories: readonly HealthCategory[],
): { state: OverviewState; title: string; detail: string } {
  if (!overview) {
    return {
      state: "loading",
      title: "Loading library health",
      detail: "Getting the last check.",
    };
  }
  const { job, check } = overview;
  const { attention, progress } = healthTotals(categories);
  const checked = check
    ? `Checked ${relativeTimeFromMs(check.checkedAt)}.`
    : "Check Library reads every file, so it can take a while on a large library.";
  const inProgress =
    progress > 0 ? ` ${formatNumber(progress)} in progress.` : "";
  if (job?.status === "running") {
    return {
      state: "checking",
      title: "Checking your library",
      detail:
        job.total > 0
          ? `${formatNumber(job.processed)} of ${formatPlural(job.total, { one: "Save", other: "Saves" })}`
          : "Listing Saves",
    };
  }
  if (job?.status === "failed") {
    return {
      state: "attention",
      title: "Couldn't check your library",
      detail: `${job.error ?? "Something went wrong."} Try again.`,
    };
  }
  const canceled =
    job?.status === "cancelled"
      ? check
        ? "Check canceled. Showing the last results. "
        : "Check canceled. "
      : "";
  if (attention > 0) {
    return {
      state: "attention",
      title: `${formatPlural(attention, ISSUES)} attention`,
      detail: `${canceled}${checked}${inProgress}`,
    };
  }
  if (!check) {
    return {
      state: "unchecked",
      title: "Not checked yet",
      detail: `${canceled}${checked}${inProgress}`,
    };
  }
  return {
    state: "ready",
    title: progress > 0 ? "Work in progress" : "Library is healthy",
    detail: `${canceled}${checked}${inProgress}`,
  };
}

function Indicator({ state }: { state: OverviewState }) {
  switch (state) {
    case "loading":
    case "checking":
      return <Loader.Spinner />;
    case "attention":
      return <IconCircleWarning />;
    case "unchecked":
      return <IconCircleQuestion />;
    case "ready":
      return <IconCircleCheck />;
  }
}

export function HealthOverview() {
  const qc = useQueryClient();
  const { categories, overview } = useHealthCategories();
  usePosterVerification();
  const copy = overviewCopy(overview, categories);
  const job = overview?.job ?? null;
  const running = job?.status === "running";
  const check = overview?.check ?? null;
  return (
    <Settings.List className={styles.card} data-state={copy.state}>
      <div className={styles.row}>
        <span className={styles.indicator} aria-hidden="true">
          <Indicator state={copy.state} />
        </span>
        <div className={styles.copy}>
          <div className={styles.summary} aria-live="polite" aria-atomic="true">
            <Settings.ItemTitle className={styles.title}>
              {copy.title}
            </Settings.ItemTitle>
            <p className={styles.detail}>{copy.detail}</p>
          </div>
          {running ? (
            <progress
              className={styles.progress}
              aria-label="Check progress"
              max={Math.max(job.total, 1)}
              value={job.processed}
            />
          ) : null}
          {check ? (
            <p className={styles.meta}>
              <time dateTime={new Date(check.checkedAt).toISOString()}>
                {`Checked At ${new Date(check.checkedAt).toLocaleString()}`}
              </time>
              <span>
                {formatPlural(check.saves, { one: "Save", other: "Saves" })}
              </span>
            </p>
          ) : null}
        </div>
        {running ? (
          <Button
            className={styles.action}
            size="sm"
            variant="secondary"
            onClick={() => void cancelCheck(qc)}
          >
            Cancel
          </Button>
        ) : (
          <Button
            className={styles.action}
            size="sm"
            variant="secondary"
            disabled={!overview}
            onClick={() => void startCheck(qc)}
          >
            Check Library
          </Button>
        )}
      </div>
    </Settings.List>
  );
}

export function HealthDebugReport() {
  return (
    <Settings.List>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle>Debug Report</Settings.ItemTitle>
          <Settings.ItemDescription>
            Includes the latest check as counts and Save IDs, without titles or
            file paths.
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void runNewAction(exportDebugReport)}
          >
            Export Debug Report
          </Button>
        </Settings.ItemControl>
      </Settings.Item>
    </Settings.List>
  );
}
