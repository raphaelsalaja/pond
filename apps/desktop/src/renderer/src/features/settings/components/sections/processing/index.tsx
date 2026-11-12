import { IconCircleCheck, IconCircleWarning, IconPowerOff } from "@pond/icons";
import { Button, Loader, Reveal, Settings, Tooltip } from "@pond/ui";
import { useEffect, useId, useState } from "react";
import {
  type EnrichmentFailure,
  type MissingOriginal,
  useEnrichmentStatus,
} from "@/features/enrichment/status";
import { openLibraryRepair } from "@/features/library/repair";
import { formatNumber, formatPlural } from "@/shared/lib/format";
import { THIS_DEVICE } from "@/shared/lib/platform";
import { usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

const TASKS = { one: "task", other: "tasks" };
const FAILURE_SAMPLE = 5;
const FAILURE_PAGE = 20;
const GENERIC_REASON = "Couldn't finish";

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

interface NamedSave {
  id: string;
  label: string;
}

interface TaskGroup {
  task: string;
  label: string;
  left: number;
  failed: number;
  saves: NamedSave[];
}

interface FailureGroup {
  task: string;
  label: string;
  rows: EnrichmentFailure[];
}

type FailureStep = "sample" | "more" | "all";

function taskGroups(
  active: ReadonlySet<string>,
  failed: readonly EnrichmentFailure[],
): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();
  const group = (task: string) => {
    const existing = groups.get(task);
    if (existing) return existing;
    const next: TaskGroup = {
      task,
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
    entry.saves.push({
      id: failure.saveId,
      label: saveLabel({ id: failure.saveId, title: failure.title }),
    });
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function groupFailures(rows: readonly EnrichmentFailure[]): FailureGroup[] {
  const groups = new Map<string, FailureGroup>();
  for (const row of rows) {
    const existing = groups.get(row.task);
    if (existing) {
      existing.rows.push(row);
      continue;
    }
    groups.set(row.task, {
      task: row.task,
      label: TASK_LABELS.get(row.task) ?? row.task,
      rows: [row],
    });
  }
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function groupCount(group: TaskGroup): string {
  const parts: string[] = [];
  if (group.left) parts.push(`${formatNumber(group.left)} left`);
  if (group.failed) parts.push(`${formatNumber(group.failed)} failed`);
  return parts.join(", ");
}

function specificReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed || trimmed === GENERIC_REASON) return null;
  return trimmed;
}

function failureAction(
  total: number,
  step: FailureStep,
): { label: string; next: FailureStep } | null {
  if (total <= FAILURE_SAMPLE) return null;
  const shown =
    step === "all"
      ? total
      : step === "more"
        ? Math.min(total, FAILURE_SAMPLE + FAILURE_PAGE)
        : FAILURE_SAMPLE;
  if (shown >= total) return { label: "Show Less", next: "sample" };
  if (step === "sample" && total > FAILURE_SAMPLE + FAILURE_PAGE) {
    return { label: "Show More", next: "more" };
  }
  return { label: "Show All", next: "all" };
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

function failureSummary(count: number): string {
  return `${formatPlural(count, TASKS)} couldn't finish.`;
}

function FailureTitle({ row }: { row: EnrichmentFailure }) {
  const label = saveLabel({ id: row.saveId, title: row.title });
  const reason = specificReason(row.reason);
  return (
    <li className={styles.failureItem}>
      <span className={styles.saveTitle} title={label}>
        {label}
      </span>
      {reason ? <span className={styles.reason}>{reason}</span> : null}
    </li>
  );
}

function FailureSample({ group }: { group: FailureGroup }) {
  const extraId = useId();
  const [step, setStep] = useState<FailureStep>("sample");
  const action = failureAction(group.rows.length, step);
  const sample = group.rows.slice(0, FAILURE_SAMPLE);
  const page = group.rows.slice(FAILURE_SAMPLE, FAILURE_SAMPLE + FAILURE_PAGE);
  const rest = group.rows.slice(FAILURE_SAMPLE + FAILURE_PAGE);
  return (
    <li className={styles.failureGroup}>
      <div className={styles.failureHead}>
        <span className={styles.taskLabel}>{group.label}</span>
        <span className={styles.failureCount}>
          {formatPlural(group.rows.length, TASKS)} failed
        </span>
      </div>
      <ul className={styles.failureItems}>
        {sample.map((row) => (
          <FailureTitle key={row.key} row={row} />
        ))}
      </ul>
      {page.length > 0 ? (
        <div id={extraId}>
          <Reveal visible={step !== "sample"}>
            <div className={styles.expanded}>
              <ul className={styles.failureItems}>
                {page.map((row) => (
                  <FailureTitle key={row.key} row={row} />
                ))}
              </ul>
              {rest.length > 0 ? (
                <Reveal visible={step === "all"}>
                  <ul className={styles.failureItems}>
                    {rest.map((row) => (
                      <FailureTitle key={row.key} row={row} />
                    ))}
                  </ul>
                </Reveal>
              ) : null}
            </div>
          </Reveal>
        </div>
      ) : null}
      {action ? (
        <Button
          className={styles.more}
          size="xs"
          density="compact"
          variant="text"
          type="button"
          aria-expanded={step !== "sample"}
          aria-controls={page.length > 0 ? extraId : undefined}
          onClick={() => setStep(action.next)}
        >
          {action.label}
        </Button>
      ) : null}
    </li>
  );
}

function FailureSamples({ rows }: { rows: readonly EnrichmentFailure[] }) {
  const groups = groupFailures(rows);
  if (groups.length === 0) return null;
  return (
    <ul className={styles.failures} aria-label="Failed tasks">
      {groups.map((group) => (
        <FailureSample key={group.task} group={group} />
      ))}
    </ul>
  );
}

function TaskBreakdown({ groups }: { groups: readonly TaskGroup[] }) {
  return (
    <span className={styles.breakdown}>
      {groups.map((group) => {
        const saves = group.saves.slice(0, FAILURE_SAMPLE);
        const extra = group.saves.length - saves.length;
        return (
          <span key={group.task} className={styles.group}>
            <span className={styles.groupHead}>
              <span className={styles.taskLabel}>{group.label}</span>
              <span className={styles.value}>{groupCount(group)}</span>
            </span>
            {saves.length > 0 ? (
              <span className={styles.saves}>
                {saves.map((save) => (
                  <span
                    key={save.id}
                    className={styles.saveTitle}
                    title={save.label}
                  >
                    {save.label}
                  </span>
                ))}
                {extra > 0 ? (
                  <span className={styles.extra}>
                    +{formatNumber(extra)} more
                  </span>
                ) : null}
              </span>
            ) : null}
          </span>
        );
      })}
    </span>
  );
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
  const showFailures =
    loaded &&
    !checking &&
    status.inflight === 0 &&
    !checkFailed &&
    rows.length > 0;
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
                showFailures ? failureSummary(rows.length) : null,
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
        <div className={styles.copy}>
          <div className={styles.summary} aria-live="polite" aria-atomic="true">
            <Settings.ItemTitle className={styles.title}>
              {title}
            </Settings.ItemTitle>
            <p className={styles.detail}>
              <span>{detail}</span>
              {groups.length > 0 ? (
                <Tooltip.Info
                  side="top"
                  aria-label="Task Details"
                  label={<TaskBreakdown groups={groups} />}
                />
              ) : null}
            </p>
          </div>
          {showFailures ? <FailureSamples rows={rows} /> : null}
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
