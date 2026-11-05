import { IconCircleCheck, IconCircleWarning, IconPowerOff } from "@pond/icons";
import { Button, Loader, Settings, Tooltip } from "@pond/ui";
import { useEffect, useState } from "react";
import {
  type EnrichmentFailure,
  type MissingOriginal,
  useEnrichmentStatus,
} from "@/features/enrichment/status";
import { openLibraryRepair } from "@/features/library/repair";
import { formatPlural } from "@/shared/lib/format";
import { THIS_DEVICE } from "@/shared/lib/platform";
import { usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

const TASKS = { one: "task", other: "tasks" };

const TASK_LABELS = new Map<string, string>([
  ["caption", "Image Captions"],
  ["ocr", "Text in Images"],
  ["transcript", "Transcription"],
  ["clip", "Visual Similarity"],
  ["aesthetic", "Style Labels"],
  ["sensitive-content", "Sensitive Content"],
  ["autoTitle", "Generated Titles"],
  ["suggestedTags", "Suggested Tags"],
  ["textEmbedding", "Semantic Search"],
]);

interface TaskGroup {
  label: string;
  left: number;
  failed: number;
  saves: string[];
}

function taskGroups(
  active: ReadonlySet<string>,
  failed: readonly EnrichmentFailure[],
): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();
  const group = (task: string) => {
    const existing = groups.get(task);
    if (existing) return existing;
    const next = {
      label: TASK_LABELS.get(task) ?? task,
      left: 0,
      failed: 0,
      saves: [],
    };
    groups.set(task, next);
    return next;
  };
  for (const key of active) {
    group(key.slice(0, key.indexOf(":"))).left += 1;
  }
  for (const failure of failed) {
    const entry = group(failure.task);
    entry.failed += 1;
    entry.saves.push(saveLabel({ id: failure.saveId, title: failure.title }));
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function groupStatus(group: TaskGroup): string {
  const parts: string[] = [];
  if (group.left) parts.push(`${group.left.toLocaleString()} left`);
  if (group.failed) parts.push(`${group.failed.toLocaleString()} failed`);
  if (group.saves.length > 0) parts.push(group.saves.join(", "));
  return parts.join(", ");
}

function saveLabel(save: { id: string; title: string | null }): string {
  return save.title?.trim() || save.id;
}

function failureRows(
  failedKeys: ReadonlySet<string>,
  failures: readonly EnrichmentFailure[] | undefined,
): EnrichmentFailure[] {
  if (failures && failures.length > 0) return [...failures];
  return [...failedKeys].map((key) => {
    const index = key.indexOf(":");
    const task = index === -1 ? key : key.slice(0, index);
    const saveId = index === -1 ? key : key.slice(index + 1);
    return {
      key,
      saveId,
      title: null,
      task,
      reason: "Couldn't finish",
    };
  });
}

function missingDetail(missing: readonly MissingOriginal[]): string {
  const names = missing.map(saveLabel).join(", ");
  return missing.length === 1
    ? `Files missing for ${names}.`
    : `Files missing for ${missing.length} saves: ${names}.`;
}

function failureDetail(rows: readonly EnrichmentFailure[]): string {
  const described = rows
    .map((row) => {
      const task = TASK_LABELS.get(row.task) ?? row.task;
      return `${saveLabel({ id: row.saveId, title: row.title })}: ${task} — ${row.reason}`;
    })
    .join(". ");
  return `${formatPlural(rows.length, TASKS)} couldn't finish. ${described}`;
}

async function checkLibrary(): Promise<void> {
  const { runEnrichment } = await import("@/features/enrichment");
  runEnrichment();
}

export function ProcessingStatus() {
  const status = useEnrichmentStatus();
  const [ai, , loaded] = usePrefs("ai");
  const enabled =
    ai.semanticSearch ||
    ai.enableCaption ||
    ai.enableOcr ||
    ai.enableTranscript ||
    ai.enableClip ||
    ai.enableSensitiveContent ||
    ai.enableAutoTitle;
  useEffect(() => {
    if (!loaded || !enabled) return;
    let active = true;
    void import("@/features/enrichment/missing-originals")
      .then((module) => {
        if (active) return module.refreshMissingOriginals();
        return undefined;
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [loaded, enabled]);
  return (
    <ProcessingStatusCard
      status={status}
      enabled={enabled}
      loaded={loaded}
      onCheck={checkLibrary}
      onRepair={() => openLibraryRepair("invalid-content")}
    />
  );
}

export function ProcessingStatusCard({
  status,
  enabled,
  loaded = true,
  onCheck,
  onRepair,
}: {
  status: {
    inflight: number;
    activeKeys: ReadonlySet<string>;
    failedKeys: ReadonlySet<string>;
    failures?: readonly EnrichmentFailure[];
    missingOriginals?: readonly MissingOriginal[];
  };
  enabled: boolean;
  loaded?: boolean;
  onCheck: () => Promise<void>;
  onRepair: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const missing = status.missingOriginals ?? [];
  const missingIds = new Set(missing.map((save) => save.id));
  const rows = failureRows(status.failedKeys, status.failures).filter(
    (row) => !missingIds.has(row.saveId),
  );
  const busy = checking || status.inflight > 0;
  const attention = rows.length > 0 || missing.length > 0;
  const groups = taskGroups(status.activeKeys, rows);
  const state =
    !loaded || busy
      ? "processing"
      : checkFailed || attention
        ? "attention"
        : enabled
          ? "ready"
          : "off";
  const title = !loaded
    ? "Loading processing settings"
    : checking
      ? "Checking your library"
      : status.inflight > 0
        ? "Processing your library"
        : checkFailed
          ? "Couldn't check your library"
          : attention
            ? "Processing needs attention"
            : enabled
              ? "Ready for new items"
              : "Local processing is off";
  const detail = !loaded
    ? "Getting your processing preferences."
    : checking
      ? "Looking for saves that need processing."
      : status.inflight > 0
        ? `${formatPlural(status.inflight, TASKS)} left`
        : checkFailed
          ? "Try checking the library again."
          : attention
            ? [
                missing.length > 0 ? missingDetail(missing) : null,
                rows.length > 0 ? failureDetail(rows) : null,
              ]
                .filter((part) => part != null)
                .join(" ")
            : enabled
              ? `New saves are processed on ${THIS_DEVICE}.`
              : "Turn on a processing option below to get started.";
  const repair = missing.length > 0 && !busy;
  const canRetry =
    loaded && enabled && !busy && (rows.length > 0 || checkFailed);

  async function handleCheck() {
    setChecking(true);
    setCheckFailed(false);
    try {
      await onCheck();
    } catch {
      setCheckFailed(true);
    } finally {
      setChecking(false);
    }
  }

  return (
    <Settings.List className={styles.card} data-state={state}>
      <div className={styles.row}>
        <span className={styles.indicator} aria-hidden="true">
          {state === "processing" ? (
            <Loader.Spinner />
          ) : state === "attention" ? (
            <IconCircleWarning />
          ) : state === "off" ? (
            <IconPowerOff />
          ) : (
            <IconCircleCheck />
          )}
        </span>
        <div className={styles.copy} aria-live="polite" aria-atomic="true">
          <Settings.ItemTitle className={styles.title}>
            {title}
          </Settings.ItemTitle>
          <p className={styles.detail}>
            <span>{detail}</span>
            {groups.length > 0 ? (
              <Tooltip.Info
                side="top"
                aria-label="Task Details"
                label={
                  <span className={styles.breakdown}>
                    {groups.map((group) => (
                      <span key={group.label} className={styles.group}>
                        <span>{group.label}</span>
                        <span className={styles.value}>
                          {groupStatus(group)}
                        </span>
                      </span>
                    ))}
                  </span>
                }
              />
            ) : null}
          </p>
        </div>
        <Button
          className={styles.action}
          size="sm"
          variant="secondary"
          disabled={repair ? false : !loaded || !enabled || busy}
          onClick={() => {
            if (repair) onRepair();
            else void handleCheck();
          }}
        >
          {repair
            ? "Repair Invalid Content"
            : checking
              ? "Checking Library"
              : canRetry
                ? "Retry"
                : "Check Library"}
        </Button>
      </div>
    </Settings.List>
  );
}
