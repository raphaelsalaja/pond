import { sourceLabel } from "@pond/schema/sources";
import { Badge } from "@pond/ui";
import { motion, type PanInfo } from "motion/react";
import { useState } from "react";
import { REVIEW_TARGET_SELECTOR } from "@/features/library/components/inbox-review/target";
import { CardThumb, displayTitleForSave } from "@/features/saves";
import type { Save } from "@/features/saves/types";
import styles from "./styles.module.css";

const ENTER = [0.23, 1, 0.32, 1] as const;

function targetAt(info: PanInfo): string | null {
  const x = info.point.x - window.scrollX;
  const y = info.point.y - window.scrollY;
  for (const element of document.elementsFromPoint(x, y)) {
    const target = element.closest<HTMLElement>(REVIEW_TARGET_SELECTOR);
    if (target?.dataset.reviewTarget) return target.dataset.reviewTarget;
  }
  return null;
}

function status(save: Save): string | null {
  if (save.deletedAt) return "In Trash";
  if (save.inboxState === "processed") return "Processed";
  if (save.inboxState === "snoozed") return "Snoozed";
  return null;
}

interface ReviewCardProps {
  save: Save | undefined;
  fadeIn: boolean;
  onOver: (target: string | null) => void;
  onDrop: (target: string) => void;
  onOpen: () => void;
}

/** Releasing away from a target springs the card home with the pointer's velocity. */
export function ReviewCard({
  save,
  fadeIn,
  onOver,
  onDrop,
  onOpen,
}: ReviewCardProps) {
  const [dragging, setDragging] = useState(false);
  const state = save ? status(save) : null;
  return (
    <motion.div
      className={styles.card}
      data-dragging={dragging || undefined}
      drag={Boolean(save)}
      dragSnapToOrigin
      dragMomentum={false}
      dragTransition={{ bounceStiffness: 600, bounceDamping: 34 }}
      initial={fadeIn ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ opacity: { duration: 0.15, ease: ENTER } }}
      onDragStart={() => setDragging(true)}
      onDrag={(_, info) => onOver(targetAt(info))}
      onDragEnd={(_, info) => {
        setDragging(false);
        const target = targetAt(info);
        onOver(null);
        if (target) onDrop(target);
      }}
      onDoubleClick={onOpen}
    >
      <div className={styles.media}>
        {save ? <CardThumb save={save} width={480} /> : null}
        {state ? (
          <Badge className={styles.status} tone="inverted">
            {state}
          </Badge>
        ) : null}
      </div>
      <div className={styles.caption}>
        <span className={styles.title}>
          {save ? displayTitleForSave(save) : "Loading save"}
        </span>
        {save ? (
          <span className={styles.meta}>
            {save.siteName || sourceLabel(save.source)}
          </span>
        ) : null}
      </div>
    </motion.div>
  );
}
