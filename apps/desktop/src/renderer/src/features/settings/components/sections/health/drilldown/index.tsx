import { Button, Dialog, Toggle, ToggleGroup } from "@pond/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { DownloadHealthRow } from "@/features/downloads/health";
import { openSave } from "@/features/saves/navigation";
import { formatNumber, formatPlural } from "@/shared/lib/format";
import { THIS_DEVICE } from "@/shared/lib/platform";
import { type HealthAction, healthActions } from "../actions";
import {
  categoryFact,
  type HealthCategory,
  type HealthEntry,
  type HealthStatus,
  STATUS_LABELS,
  statusBreakdown,
} from "../categories";
import { HealthEntryRow } from "../entry";
import styles from "./styles.module.css";

type Filter = HealthStatus | "all";

const SAVES = { one: "Save", other: "Saves" };

export function HealthDrilldown({
  category,
  open,
  onOpenChange,
  downloads,
}: {
  category: HealthCategory | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  downloads: readonly DownloadHealthRow[];
}) {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const entries = category?.entries ?? [];
  const breakdown = statusBreakdown(entries);
  const active: Filter =
    filter !== "all" && breakdown.some(([status]) => status === filter)
      ? filter
      : "all";
  const shown =
    active === "all"
      ? entries
      : entries.filter((entry) => entry.status === active);
  const unlisted = category ? Math.max(0, category.total - entries.length) : 0;

  async function run(key: string, action: HealthAction): Promise<void> {
    if (action.navigates) onOpenChange(false);
    setBusy(key);
    try {
      await action.run();
    } finally {
      setBusy(null);
    }
  }

  function actionsFor(targets: readonly HealthEntry[]): HealthAction[] {
    return category
      ? healthActions(category.id, targets, { qc, downloads })
      : [];
  }

  function entryActions(entry: HealthEntry) {
    return (
      <>
        {entry.openable ? (
          <Button
            size="xs"
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
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
              disabled={busy != null}
              onClick={() => void run(`${entry.id}:${action.id}`, action)}
            >
              {action.label}
            </Button>
          ))}
      </>
    );
  }

  const bulk = actionsFor(shown);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop />
        <Dialog.Popup className={styles.popup}>
          <Dialog.Header>
            <Dialog.Title>{category?.title}</Dialog.Title>
          </Dialog.Header>
          <Dialog.Description>
            {category ? categoryFact(category.id, THIS_DEVICE) : null}
          </Dialog.Description>
          <Dialog.Content className={styles.content}>
            {breakdown.length > 1 ? (
              <ToggleGroup
                aria-label="Status"
                className={styles.filters}
                value={[active]}
                onValueChange={(value) => {
                  const next = breakdown.find(
                    ([status]) => status === value[0],
                  );
                  setFilter(next ? next[0] : "all");
                }}
              >
                <Toggle type="button" size="sm" value="all">
                  {`All ${formatNumber(entries.length)}`}
                </Toggle>
                {breakdown.map(([status, count]) => (
                  <Toggle key={status} type="button" size="sm" value={status}>
                    {`${STATUS_LABELS[status]} ${formatNumber(count)}`}
                  </Toggle>
                ))}
              </ToggleGroup>
            ) : null}
            {shown.length === 0 ? (
              <p className={styles.empty}>Nothing to review.</p>
            ) : (
              <ul className={styles.list} aria-label="Affected Saves">
                {shown.map((entry) => (
                  <HealthEntryRow
                    key={entry.id}
                    entry={entry}
                    history={category?.id === "downloads"}
                    actions={entryActions(entry)}
                  />
                ))}
              </ul>
            )}
            {unlisted > 0 ? (
              <p className={styles.note}>
                {`${formatPlural(unlisted, SAVES)} more aren't listed. Repair or recheck these, then check again to see the rest.`}
              </p>
            ) : null}
          </Dialog.Content>
          <Dialog.Footer>
            <Dialog.Cancel>Close</Dialog.Cancel>
            {bulk.map((action) => (
              <Button
                key={action.id}
                variant={action.primary ? "primary" : "secondary"}
                loading={busy === `bulk:${action.id}`}
                disabled={busy != null}
                onClick={() => void run(`bulk:${action.id}`, action)}
              >
                {action.navigates || action.bulkOnly
                  ? action.label
                  : `${action.label} ${formatPlural(action.count, SAVES)}`}
              </Button>
            ))}
          </Dialog.Footer>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
