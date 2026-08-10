import { IconScanImageOutline18 } from "@pond/icons/outline/18";
import { Button } from "@pond/ui";
import type { MediaIndexStatus } from "@shared/media-index";
import { useMediaIndex } from "@/hooks/use-media-index";
import type { Panel } from "./lib";
import styles from "./media-index.module.css";
import { StatusPanel } from "./panel";

interface MediaIndexPanelProps {
  open: boolean;
  onOpenChange: (next: Panel | null) => void;
}

export function mediaIndexCopy(status: MediaIndexStatus): {
  title: string;
  detail: string;
  action: "start" | "pause" | "resume";
  actionLabel: string;
} {
  switch (status.state) {
    case "indexing":
      return {
        title: "Preparing media",
        detail: status.currentTitle
          ? `Preparing ${status.currentTitle}`
          : `${status.prepared} prepared · ${status.remaining} remaining`,
        action: "pause",
        actionLabel: "Pause",
      };
    case "paused-user":
      return {
        title: "Indexing paused",
        detail: `${status.prepared} prepared · ${status.remaining} remaining`,
        action: "resume",
        actionLabel: "Resume",
      };
    case "paused-system": {
      const detail =
        status.pauseReason === "battery"
          ? "Waiting for power"
          : status.pauseReason === "thermal"
            ? "Waiting for your Mac to cool down"
            : "Waiting until your Mac is idle";
      return {
        title: "Media index waiting",
        detail,
        action: "start",
        actionLabel: "Index now",
      };
    }
    case "complete":
      return {
        title: "All media prepared",
        detail: `${status.prepared} previews checked`,
        action: "start",
        actionLabel: "Check again",
      };
    case "error":
      return {
        title: "Indexing stopped",
        detail: status.lastError || "Some media couldn’t be prepared.",
        action: "start",
        actionLabel: "Retry",
      };
    default:
      return {
        title: "Media index",
        detail: "Prepare previews so your library opens faster.",
        action: "start",
        actionLabel: "Index now",
      };
  }
}

export function MediaIndexPanel({ open, onOpenChange }: MediaIndexPanelProps) {
  const { status, pending, start, pause, resume } = useMediaIndex();
  const copy = mediaIndexCopy(status);
  const total = status.prepared + status.remaining;
  const action =
    copy.action === "pause" ? pause : copy.action === "resume" ? resume : start;

  return (
    <StatusPanel
      open={open}
      onOpenChange={(next) => onOpenChange(next ? "media-index" : null)}
      label="Media index"
      icon={
        <span
          className={styles.icon}
          data-indexing={status.state === "indexing" ? "" : undefined}
        >
          <IconScanImageOutline18 />
        </span>
      }
    >
      <div className={styles.body} aria-live="polite">
        <div className={styles.copy}>
          <span className={styles.title}>{copy.title}</span>
          <span className={styles.detail}>{copy.detail}</span>
        </div>
        {total > 0 ? (
          <progress
            className={styles.progress}
            max={total}
            value={status.prepared}
            aria-label={`${status.prepared} of ${total} media previews prepared`}
          />
        ) : null}
        <Button
          variant={copy.action === "pause" ? "secondary" : "primary"}
          size="sm"
          width="full"
          disabled={pending}
          onClick={() => void action()}
        >
          {copy.actionLabel}
        </Button>
      </div>
    </StatusPanel>
  );
}
