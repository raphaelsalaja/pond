import { Button, type ButtonProps, Keyboard } from "@pond/ui";
import { clsx as cn } from "clsx";
import type { ReactNode } from "react";
import styles from "./styles.module.css";

/** The dragged card hit-tests this attribute, so every target names its action in it. */
export const REVIEW_TARGET_SELECTOR = "[data-review-target]";

interface ReviewTargetProps
  extends Omit<ButtonProps, "variant" | "children" | "icon"> {
  target: string;
  over: boolean;
  tone?: "keep" | "trash" | "folder";
  layout?: "tile" | "chip";
  icon: ReactNode;
  label: string;
  hint: string;
}

export function ReviewTarget({
  target,
  over,
  tone = "folder",
  layout = "tile",
  icon,
  label,
  hint,
  className,
  ...props
}: ReviewTargetProps) {
  return (
    <Button
      variant="bare"
      className={cn(styles.target, className)}
      data-review-target={target}
      data-over={over || undefined}
      data-tone={tone}
      data-layout={layout}
      {...props}
    >
      <span className={styles.icon}>{icon}</span>
      <span className={styles.label}>{label}</span>
      <Keyboard.Shortcut className={styles.hint} density="inline">
        {hint}
      </Keyboard.Shortcut>
    </Button>
  );
}
