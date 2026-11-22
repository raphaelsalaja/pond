import { useDndContext, useDroppable } from "@dnd-kit/core";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { clsx as cn } from "clsx";
import { useReducedMotionConfig } from "motion/react";
import type { ReactElement, RefAttributes } from "react";
import styles from "./styles.module.css";

export type FishDragProps = React.HTMLAttributes<HTMLElement> &
  RefAttributes<HTMLButtonElement>;

export function SortableFish({
  id,
  render,
}: {
  id: string;
  render: (dragProps: FishDragProps) => ReactElement;
}) {
  const reduceMotion = useReducedMotionConfig();
  const { activatorEvent } = useDndContext();
  const keyboardDrag = activatorEvent?.type.startsWith("key") ?? false;
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  return (
    <div
      className={styles.sortable}
      data-dragging={isDragging || undefined}
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        transition: reduceMotion || keyboardDrag ? "none" : transition,
      }}
    >
      {render({ ...attributes, ...listeners, ref: setActivatorNodeRef })}
    </div>
  );
}

interface ShelfProps extends React.ComponentPropsWithoutRef<"div"> {
  id: string;
}

/** Lets a fish land on a shelf with no fish to drop beside. */
export function Shelf({ id, className, ...props }: ShelfProps) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(styles.shelf, className)}
      data-over={isOver || undefined}
      {...props}
    />
  );
}
