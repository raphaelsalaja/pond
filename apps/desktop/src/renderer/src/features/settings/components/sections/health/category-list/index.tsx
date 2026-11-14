import { Badge, Button, Settings } from "@pond/ui";
import { useState } from "react";
import { formatNumber } from "@/shared/lib/format";
import { THIS_DEVICE } from "@/shared/lib/platform";
import {
  categoryFact,
  type HealthCategory,
  type HealthCategoryId,
  type HealthGroup,
  type HealthStatus,
  STATUS_LABELS,
  statusBreakdown,
} from "../categories";
import { HealthDrilldown } from "../drilldown";
import { STATUS_TONES } from "../tones";
import { useHealthCategories } from "../use-library-health";
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
          <Settings.Item key={category.id} disabled={!category.checked}>
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
                onClick={() => {
                  setSelected(category.id);
                  setOpen(true);
                }}
              >
                Review
              </Button>
            </Settings.ItemControl>
          </Settings.Item>
        ))}
      </Settings.List>
      <HealthDrilldown
        category={active}
        open={open && active != null}
        onOpenChange={setOpen}
        downloads={downloads}
      />
    </>
  );
}
