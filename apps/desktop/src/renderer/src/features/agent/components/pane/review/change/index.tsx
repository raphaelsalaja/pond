import {
  IconCheck,
  IconFolder,
  IconLayers,
  IconStar,
  IconTag,
  IconText,
  IconTextAlignLeft,
  IconTrash,
  IconXmark,
} from "@pond/icons";
import { Button, Tooltip } from "@pond/ui";
import type { AssistantChange } from "@shared/assistant";
import { clsx as cn } from "clsx";
import { Fragment } from "react";
import type { ReviewAction } from "@/features/agent/state/review";
import { reviewTitle, summaryParts } from "../lib";
import styles from "./styles.module.css";

export const statusLabels = {
  applied: "Applied",
  dismissed: "Dismissed",
  undone: "Undone",
};

export const fieldIcons = {
  title: IconText,
  note: IconTextAlignLeft,
  tags: IconTag,
  folders: IconFolder,
  rating: IconStar,
  trash: IconTrash,
  action: IconLayers,
};

export interface ChangeProps {
  change: AssistantChange;
  busy: boolean;
  working: boolean;
  folderName: (id: string) => string;
  onAction: (action: ReviewAction) => void;
}

export function ChangeSummary({
  change,
  folderName,
  className,
  id,
}: {
  change: AssistantChange;
  folderName: (id: string) => string;
  className?: string;
  id?: string;
}) {
  return (
    <span id={id} className={cn(styles.summary, className)}>
      {summaryParts(change, folderName).map((part, index) => (
        <Fragment key={`${part.tone}-${part.text}`}>
          {index ? " " : null}
          <span data-tone={part.tone}>{part.text}</span>
        </Fragment>
      ))}
    </span>
  );
}

export function ChangeActions({
  change,
  busy,
  working,
  onAction,
}: {
  change: AssistantChange;
  busy: boolean;
  working: boolean;
  onAction: (action: ReviewAction) => void;
}) {
  const title = reviewTitle(change.title);
  if (working) {
    return null;
  }
  if (change.status === "pending") {
    return (
      <span className={styles.actions}>
        <Tooltip label="Dismiss">
          <Button
            icon
            size="xs"
            variant="ghost"
            disabled={busy}
            aria-label={`Dismiss change to ${title}`}
            onClick={() => onAction("dismiss")}
          >
            <IconXmark size={12} />
          </Button>
        </Tooltip>
        <Tooltip label={change.error ? "Retry" : "Apply"}>
          <Button
            icon
            size="xs"
            variant="ghost"
            disabled={busy}
            aria-label={`${change.error ? "Retry" : "Apply"} change to ${title}`}
            onClick={() => onAction("apply")}
          >
            <IconCheck size={12} />
          </Button>
        </Tooltip>
      </span>
    );
  }
  if (change.status !== "applied" || change.undoable === false) {
    return null;
  }
  return (
    <span className={styles.actions}>
      <Button
        size="xs"
        variant="ghost"
        disabled={busy}
        aria-label={`Undo change to ${title}`}
        onClick={() => onAction("undo")}
      >
        Undo
      </Button>
    </span>
  );
}
