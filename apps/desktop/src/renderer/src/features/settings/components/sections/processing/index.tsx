import {
  IconCircleCheck,
  IconCircleInfo,
  IconCircleWarning,
  IconPowerOff,
} from "@pond/icons";
import { Button, Loader, Settings, Tooltip } from "@pond/ui";
import { useState } from "react";
import { useEnrichmentStatus } from "@/features/enrichment/status";
import { THIS_DEVICE } from "@/shared/lib/platform";
import { usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

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
}

function taskGroups(
  active: ReadonlySet<string>,
  failed: ReadonlySet<string>,
): TaskGroup[] {
  const groups = new Map<string, TaskGroup>();
  const group = (key: string) => {
    const id = key.slice(0, key.indexOf(":"));
    const existing = groups.get(id);
    if (existing) return existing;
    const next = { label: TASK_LABELS.get(id) ?? id, left: 0, failed: 0 };
    groups.set(id, next);
    return next;
  };
  for (const key of active) group(key).left += 1;
  for (const key of failed) group(key).failed += 1;
  return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

function groupStatus(group: TaskGroup): string {
  const parts: string[] = [];
  if (group.left) parts.push(`${group.left.toLocaleString()} left`);
  if (group.failed) parts.push(`${group.failed.toLocaleString()} failed`);
  return parts.join(", ");
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
  return (
    <ProcessingStatusCard
      status={status}
      enabled={enabled}
      loaded={loaded}
      onCheck={checkLibrary}
    />
  );
}

export function ProcessingStatusCard({
  status,
  enabled,
  loaded = true,
  onCheck,
}: {
  status: ReturnType<typeof useEnrichmentStatus>;
  enabled: boolean;
  loaded?: boolean;
  onCheck: () => Promise<void>;
}) {
  const [checking, setChecking] = useState(false);
  const [checkFailed, setCheckFailed] = useState(false);
  const busy = checking || status.inflight > 0;
  const failed = status.failedKeys.size;
  const groups = taskGroups(status.activeKeys, status.failedKeys);
  const state =
    !loaded || busy
      ? "processing"
      : checkFailed || failed
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
          : failed
            ? "Processing needs attention"
            : enabled
              ? "Ready for new items"
              : "Local processing is off";
  const detail = !loaded
    ? "Getting your processing preferences."
    : checking
      ? "Looking for saves that need processing."
      : status.inflight > 0
        ? `${plural(status.inflight, "task", "tasks")} left`
        : checkFailed
          ? "Try checking the library again."
          : failed
            ? `${plural(failed, "task", "tasks")} couldn't finish`
            : enabled
              ? `New saves are processed on ${THIS_DEVICE}.`
              : "Turn on a processing option below to get started.";
  const canRetry = loaded && enabled && !busy && (failed > 0 || checkFailed);

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
              <Tooltip
                side="top"
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
              >
                <Button
                  className={styles.info}
                  icon
                  size="xs"
                  variant="ghost"
                  aria-label="Task Details"
                >
                  <IconCircleInfo size={12} />
                </Button>
              </Tooltip>
            ) : null}
          </p>
        </div>
        <Button
          className={styles.action}
          size="sm"
          variant="secondary"
          disabled={!loaded || !enabled || busy}
          onClick={() => void handleCheck()}
        >
          {checking ? "Checking Library" : canRetry ? "Retry" : "Check Library"}
        </Button>
      </div>
    </Settings.List>
  );
}
