import {
  IconChevronLeftOutline18,
  IconChevronRightOutline18,
  IconDotsOutline18,
  IconStar2Outline18,
} from "@pond/icons/outline/18";
import { Tooltip, useToast } from "@pond/ui";
import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SaveActionsMenu } from "@/components/save-context-menu";
import type { Save } from "@/pool/types";
import styles from "./styles.module.css";
import type { ListContext } from "./use-list-context";

interface HeaderProps {
  save: Save;
  list: ListContext;
}

export function DetailHeader({ save, list }: HeaderProps) {
  const navigate = useNavigate();

  const goPrev = useCallback(() => {
    if (!list.prevId) return;
    navigate(list.buildDetailPath(list.prevId));
  }, [list, navigate]);

  const goNext = useCallback(() => {
    if (!list.nextId) return;
    navigate(list.buildDetailPath(list.nextId));
  }, [list, navigate]);

  const counter =
    list.index >= 0 ? `${list.index + 1} / ${list.total}` : `— / ${list.total}`;

  return (
    <header className={styles.header}>
      <div className={styles["header-lead"]}>
        <Link className={styles["header-back"]} to={list.parentTo}>
          <IconChevronLeftOutline18 width={14} height={14} aria-hidden />
          <span>{list.parentLabel}</span>
        </Link>
        <span
          className={styles["header-counter"]}
          role="status"
          aria-label="Position in list"
        >
          {counter}
        </span>
      </div>

      <div className={styles["header-actions"]}>
        <StatusPill save={save} />
        <Tooltip.Root>
          <Tooltip.Trigger
            render={
              <button
                type="button"
                className={styles["header-icon-btn"]}
                aria-label="Star (coming soon)"
                disabled
              >
                <IconStar2Outline18 width={14} height={14} />
              </button>
            }
          />
          <Tooltip.Portal>
            <Tooltip.Positioner side="bottom">
              <Tooltip.Popup>Star</Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
        <SaveActionsMenu save={save}>
          <button
            type="button"
            className={styles["header-icon-btn"]}
            aria-label="More options"
          >
            <IconDotsOutline18 width={14} height={14} />
          </button>
        </SaveActionsMenu>
        <span className={styles["header-divider"]} aria-hidden />
        <Tooltip.Root>
          <Tooltip.Trigger
            render={
              <button
                type="button"
                className={styles["header-icon-btn"]}
                onClick={goPrev}
                disabled={!list.prevId}
                aria-label="Previous save"
              >
                <IconChevronLeftOutline18 width={14} height={14} />
              </button>
            }
          />
          <Tooltip.Portal>
            <Tooltip.Positioner side="bottom">
              <Tooltip.Popup>Previous (K)</Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
        <Tooltip.Root>
          <Tooltip.Trigger
            render={
              <button
                type="button"
                className={styles["header-icon-btn"]}
                onClick={goNext}
                disabled={!list.nextId}
                aria-label="Next save"
              >
                <IconChevronRightOutline18 width={14} height={14} />
              </button>
            }
          />
          <Tooltip.Portal>
            <Tooltip.Positioner side="bottom">
              <Tooltip.Popup>Next (J)</Tooltip.Popup>
            </Tooltip.Positioner>
          </Tooltip.Portal>
        </Tooltip.Root>
      </div>
    </header>
  );
}

function StatusPill({ save }: { save: Save }) {
  const toast = useToast();
  const [retrying, setRetrying] = useState(false);
  const status = save.status ?? "complete";
  if (status === "complete") return null;
  if (status === "ingesting") {
    const running = save.tasks?.find((t) => t.status === "running");
    const label = running ? running.op.replace(/_/g, " ") : "ingesting";
    return (
      <span
        className={styles["status-pill"]}
        data-state="ingesting"
        title={`Pipeline running: ${label}`}
      >
        <span className={styles["status-dot"]} aria-hidden />
        {label}
      </span>
    );
  }
  const failedTask = save.tasks?.find((t) => t.status === "failed");
  const reason = failedTask?.lastError ?? "Ingest failed";
  return (
    <button
      type="button"
      className={styles["status-pill"]}
      data-state="failed"
      disabled={retrying}
      title={reason}
      onClick={async () => {
        setRetrying(true);
        try {
          const r = await window.pond.refreshSave(save.id);
          toast.add({
            title: r.ok ? "Retrying ingest" : "Couldn't retry",
            description: r.ok
              ? "The pipeline will pick this up shortly."
              : "Try again in a moment.",
            type: r.ok ? "success" : "error",
          });
        } finally {
          setRetrying(false);
        }
      }}
    >
      {retrying ? "Retrying…" : "Retry ingest"}
    </button>
  );
}
