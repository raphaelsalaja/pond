import { Badge, Button, Settings } from "@pond/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { DownloadHealthRow } from "@/features/downloads/health";
import { formatNumber } from "@/shared/lib/format";
import { THIS_DEVICE } from "@/shared/lib/platform";
import { healthActions } from "../actions";
import { categoryFact, STATUS_LABELS, statusBreakdown } from "../categories";
import type {
  HealthCategory,
  HealthCategoryId,
  HealthGroup,
  HealthStatus,
} from "../categories";
import { HealthDrilldown } from "../drilldown";
import { STATUS_TONES } from "../tones";
import { useCategoryRunning, useHealthCategories } from "../use-library-health";
import styles from "./styles.module.css";

const COUNT_PHRASES = {
  healthy: "healthy",
  pending: "pending",
  processing: "processing",
  deferred: "deferred",
  blocked: "blocked",
  failed: "failed",
  terminal: "won't retry",
  damaged: "to repair",
  unverified: "couldn't be checked",
  unchecked: "not checked",
} satisfies Record<HealthStatus, string>;

function categorySummary(category: HealthCategory): string {
  if (category.status === "unchecked") {
    return categoryFact(category.id, THIS_DEVICE);
  }
  if (category.status === "unverified" && category.entries.length === 0) {
    return "Pond couldn't read the library index. Check again.";
  }
  const breakdown = statusBreakdown(category.entries);
  if (breakdown.length === 0) {
    return category.progress > 0
      ? `${formatNumber(category.progress)} in progress.`
      : categoryFact(category.id, THIS_DEVICE);
  }
  const listed = category.entries.length;
  const parts = breakdown.map(
    ([status, count]) => `${formatNumber(count)} ${COUNT_PHRASES[status]}`,
  );
  if (category.total > listed) {
    parts.push(`${formatNumber(category.total - listed)} more`);
  }
  return `${parts.join(", ")}.`;
}

function CategoryRow({
  category,
  downloads,
  onReview,
}: {
  category: HealthCategory;
  downloads: ReadonlyArray<DownloadHealthRow>;
  onReview: () => void;
}) {
  const qc = useQueryClient();
  const running = useCategoryRunning(category.id);
  const [busy, setBusy] = useState(false);
  const action = healthActions(category.id, category.entries, {
    qc,
    downloads,
  }).find((candidate) => candidate.primary && !candidate.navigates);

  async function run(): Promise<void> {
    if (!action) return;
    setBusy(true);
    try {
      await action.run();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Settings.Item disabled={!category.checked}>
      <Settings.ItemDetails>
        <Settings.ItemTitle>{category.title}</Settings.ItemTitle>
        <Settings.ItemDescription>
          {categorySummary(category)}
        </Settings.ItemDescription>
      </Settings.ItemDetails>
      <Settings.ItemControl className={styles.control}>
        <Badge tone={STATUS_TONES[category.status]}>
          {STATUS_LABELS[category.status]}
        </Badge>
        <Button
          size="sm"
          variant="secondary"
          disabled={category.entries.length === 0}
          aria-label={`Review ${category.title}`}
          onClick={onReview}
        >
          Review
        </Button>
        {action ? (
          <Button
            size="sm"
            variant="secondary"
            loading={running || busy}
            disabled={running || busy}
            aria-label={`${action.label} ${category.title}`}
            onClick={() => void run()}
          >
            {action.label}
          </Button>
        ) : null}
      </Settings.ItemControl>
    </Settings.Item>
  );
}

export function HealthCategoryList({ group }: { group: HealthGroup }) {
  const { categories, downloads } = useHealthCategories();
  const [selected, setSelected] = useState<HealthCategoryId | null>(null);
  const [open, setOpen] = useState(false);
  const shown = categories.filter((category) => category.group === group);
  const active =
    categories.find((category) => category.id === selected) ?? null;
  return (
    <>
      <Settings.List>
        {shown.map((category) => (
          <CategoryRow
            key={category.id}
            category={category}
            downloads={downloads}
            onReview={() => {
              setSelected(category.id);
              setOpen(true);
            }}
          />
        ))}
      </Settings.List>
      <HealthDrilldown
        category={active}
        open={open && active !== null}
        onOpenChange={setOpen}
        downloads={downloads}
      />
    </>
  );
}
