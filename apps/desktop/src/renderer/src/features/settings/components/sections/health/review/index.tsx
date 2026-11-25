import { Button, Toggle, ToggleGroup } from "@pond/ui";
import type { ButtonProps } from "@pond/ui";
import { useQueryClient } from "@tanstack/react-query";
import { clsx as cn } from "clsx";
import { createContext, use, useState } from "react";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { DownloadHealthRow } from "@/features/downloads/health";
import { openSave } from "@/features/saves/navigation";
import { formatNumber, formatPlural } from "@/shared/lib/format";
import { THIS_DEVICE } from "@/shared/lib/platform";
import { healthActions } from "../actions";
import type { HealthAction } from "../actions";
import { categoryFact, STATUS_LABELS, statusBreakdown } from "../categories";
import type { HealthCategory, HealthEntry, HealthStatus } from "../categories";
import { HealthEntryRow } from "../entry";
import { useCategoryRunning } from "../use-library-health";
import styles from "./styles.module.css";

type Filter = HealthStatus | "all";

const SAVES = { one: "Save", other: "Saves" };

interface ReviewValue {
  category: HealthCategory;
  breakdown: Array<[HealthStatus, number]>;
  filter: Filter;
  setFilter: (filter: Filter) => void;
  shown: ReadonlyArray<HealthEntry>;
  busy: string | null;
  running: boolean;
  run: (key: string, action: HealthAction) => Promise<void>;
  actionsFor: (targets: ReadonlyArray<HealthEntry>) => Array<HealthAction>;
  onNavigate: (() => void) | undefined;
}

const ReviewContext = createContext<ReviewValue | null>(null);

interface RootProps {
  category: HealthCategory;
  downloads: ReadonlyArray<DownloadHealthRow>;
  /** Runs before an action leaves this view, so a dialog can close first. */
  onNavigate?: () => void;
  children: ReactNode;
}

function Root({ category, downloads, onNavigate, children }: RootProps) {
  const qc = useQueryClient();
  const [selected, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const running = useCategoryRunning(category.id);
  const breakdown = statusBreakdown(category.entries);
  const filter: Filter =
    selected !== "all" && breakdown.some(([status]) => status === selected)
      ? selected
      : "all";
  const shown =
    filter === "all"
      ? category.entries
      : category.entries.filter((entry) => entry.status === filter);

  async function run(key: string, action: HealthAction): Promise<void> {
    if (action.navigates) onNavigate?.();
    setBusy(key);
    try {
      await action.run();
    } finally {
      setBusy(null);
    }
  }

  function actionsFor(
    targets: ReadonlyArray<HealthEntry>,
  ): Array<HealthAction> {
    return healthActions(category.id, targets, { qc, downloads });
  }

  return (
    <ReviewContext
      value={{
        category,
        breakdown,
        filter,
        setFilter,
        shown,
        busy,
        running,
        run,
        actionsFor,
        onNavigate,
      }}
    >
      {children}
    </ReviewContext>
  );
}

/** Parts render nothing outside a Root, so callers can mount them before Health loads. */
function useReview(): ReviewValue | null {
  return use(ReviewContext);
}

function Filters({ className }: { className?: string }) {
  const review = useReview();
  if (!review || review.breakdown.length < 2) return null;
  const { breakdown, filter, setFilter, category } = review;
  return (
    <ToggleGroup
      aria-label="Status"
      className={className}
      value={[filter]}
      onValueChange={(value) => {
        const next = breakdown.find(([status]) => status === value[0]);
        setFilter(next ? next[0] : "all");
      }}
    >
      <Toggle type="button" size="sm" value="all">
        {`All ${formatNumber(category.entries.length)}`}
      </Toggle>
      {breakdown.map(([status, count]) => (
        <Toggle key={status} type="button" size="sm" value={status}>
          {`${STATUS_LABELS[status]} ${formatNumber(count)}`}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

function EntryActions({
  entry,
  review,
}: {
  entry: HealthEntry;
  review: ReviewValue;
}) {
  const { busy, running, run, actionsFor, onNavigate } = review;
  return (
    <>
      {entry.openable ? (
        <Button
          size="xs"
          variant="secondary"
          onClick={() => {
            onNavigate?.();
            openSave(entry.saveId);
          }}
        >
          Open Save
        </Button>
      ) : null}
      {actionsFor([entry])
        .filter((action) => !action.navigates && !action.bulkOnly)
        .map((action) => (
          <Button
            key={action.id}
            size="xs"
            variant="secondary"
            loading={busy === `${entry.id}:${action.id}`}
            disabled={busy !== null || running}
            onClick={() => void run(`${entry.id}:${action.id}`, action)}
          >
            {action.label}
          </Button>
        ))}
    </>
  );
}

function List({ className, ...props }: ComponentPropsWithoutRef<"ul">) {
  const review = useReview();
  if (!review) return null;
  const { shown, category } = review;
  if (shown.length === 0) {
    return category.entries.length > 0 ? (
      <p className={styles.empty}>Nothing to review.</p>
    ) : null;
  }
  return (
    <ul
      className={cn(styles.list, className)}
      aria-label="Affected Saves"
      {...props}
    >
      {shown.map((entry) => (
        <HealthEntryRow
          key={entry.id}
          entry={entry}
          history={category.id === "downloads"}
          actions={<EntryActions entry={entry} review={review} />}
        />
      ))}
    </ul>
  );
}

function Fact({ className, ...props }: ComponentPropsWithoutRef<"p">) {
  const review = useReview();
  if (!review) return null;
  return (
    <p className={className} {...props}>
      {categoryFact(review.category.id, THIS_DEVICE)}
    </p>
  );
}

function Note() {
  const review = useReview();
  if (!review) return null;
  const { category } = review;
  const unlisted = Math.max(0, category.total - category.entries.length);
  return unlisted > 0 ? (
    <p className={styles.note}>
      {`${formatPlural(unlisted, SAVES)} more aren't listed. Repair or recheck these, then check again to see the rest.`}
    </p>
  ) : null;
}

/** Bulk actions for the filtered entries; `fallback` shows when there are none. */
function Actions({
  size,
  fallback = null,
}: {
  size?: ButtonProps["size"];
  fallback?: ReactNode;
}) {
  const review = useReview();
  const bulk = review ? review.actionsFor(review.shown) : [];
  if (!review || bulk.length === 0) return fallback;
  const { busy, running, run } = review;
  return bulk.map((action) => (
    <Button
      key={action.id}
      size={size}
      variant={action.primary ? "primary" : "secondary"}
      loading={busy === `bulk:${action.id}` || (running && action.primary)}
      disabled={busy !== null || running}
      onClick={() => void run(`bulk:${action.id}`, action)}
    >
      {action.navigates || action.bulkOnly
        ? action.label
        : `${action.label} ${formatPlural(action.count, SAVES)}`}
    </Button>
  ));
}

export const HealthReview = { Root, Fact, Filters, List, Note, Actions };
