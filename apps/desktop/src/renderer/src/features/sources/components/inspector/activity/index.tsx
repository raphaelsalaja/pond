import { IconHistory } from "@pond/icons";
import type { Source } from "@pond/schema/db";
import { Button, Empty, EmptyPreview, Loader, Settings } from "@pond/ui";
import {
  runFreshCount,
  useSourceHistory,
} from "@/features/sources/hooks/use-source-activity";
import type { SourceRun } from "@/features/sources/hooks/use-source-activity";
import { formatPlural } from "@/shared/lib/format";
import { relativeTimeFromMs } from "@/shared/lib/relative-time";
import { notify } from "@/shared/lib/toast";
import styles from "./styles.module.css";

function triggerLabel(trigger: string): string {
  return trigger === "cron" ? "Scheduled Fetch" : "Fetch";
}

function outcomeLabel(run: SourceRun): string {
  switch (run.outcome) {
    case "ok":
    case "noop": {
      const fresh = runFreshCount(run);
      if (fresh === 0) {
        return "No new saves";
      }
      return formatPlural(fresh, { one: "new save", other: "new saves" });
    }
    case "auth_required":
      return "Signed out";
    case "rate_limited":
      return "Rate limited";
    case "aborted":
      return run.watchdogTripped ? "Timed out" : "Stopped";
    default:
      return "Failed";
  }
}

function durationLabel(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 1) {
    return "under a second";
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${seconds % 60}s`;
}

function when(ts: number): string {
  const text = relativeTimeFromMs(ts);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

async function copyError(message: string): Promise<void> {
  const result = await window.pond.query("clipboard.writeText", {
    text: message,
  });
  notify({
    id: "source-copy-fetch-error",
    title: result.ok ? "Fetch error copied" : "Couldn't copy. Try again.",
  });
}

export function SourceActivity({ id, source }: { id: string; source: Source }) {
  const history = useSourceHistory(source, id);
  const runs = history.data ?? [];
  if (runs.length === 0) {
    return (
      <Empty.Root size="card">
        <Empty.Media>
          {history.isPending ? (
            <Loader.Spinner />
          ) : (
            <EmptyPreview.Root layout="list">
              <EmptyPreview.Row>
                <EmptyPreview.Icon>
                  <IconHistory size={12} />
                </EmptyPreview.Icon>
                <EmptyPreview.Line width={46} />
                <EmptyPreview.Space />
                <EmptyPreview.Line width={24} tone="mid" />
              </EmptyPreview.Row>
            </EmptyPreview.Root>
          )}
        </Empty.Media>
        <Empty.Title>
          {history.isPending ? "Loading Activity" : "No Fetches Yet"}
        </Empty.Title>
        {history.isPending ? null : (
          <Empty.Description>
            Each fetch shows here with what it found.
          </Empty.Description>
        )}
      </Empty.Root>
    );
  }
  return (
    <Settings.List>
      {runs.map((run) => {
        const failed = run.outcome === "error" && run.error;
        return (
          <Settings.Item key={run.id}>
            <Settings.ItemDetails>
              <Settings.ItemTitle>
                {triggerLabel(run.trigger)}
              </Settings.ItemTitle>
              <Settings.ItemDescription>
                {failed && run.error
                  ? run.error.message
                  : `${when(run.ts)}, took ${durationLabel(run.durationMs)}`}
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl className={styles.control}>
              <span
                className={styles.outcome}
                data-tone={
                  run.outcome === "ok" || run.outcome === "noop"
                    ? undefined
                    : "warn"
                }
              >
                {outcomeLabel(run)}
              </span>
              {failed && run.error ? (
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label="Copy Fetch Error"
                  onClick={() => void copyError(run.error?.message ?? "")}
                >
                  Copy
                </Button>
              ) : null}
            </Settings.ItemControl>
          </Settings.Item>
        );
      })}
    </Settings.List>
  );
}
