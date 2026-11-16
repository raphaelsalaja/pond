import { IconCheck, IconCircleDashedClock } from "@pond/icons";
import { Reveal, Shimmer } from "@pond/ui";
import { useReducedMotionConfig } from "motion/react";
import type { ReactNode } from "react";
import styles from "./styles.module.css";

export function RunStatus({
  state = "working",
  icon,
  children,
}: {
  state?: "working" | "complete" | "stopped";
  icon?: ReactNode;
  children: ReactNode;
}) {
  const reduced = useReducedMotionConfig();
  return (
    <Reveal>
      <div
        className={styles.root}
        role="status"
        data-reduced-motion={reduced || undefined}
      >
        {state === "complete" ? (
          <IconCheck />
        ) : state === "stopped" ? (
          <IconCircleDashedClock />
        ) : (
          icon
        )}
        {state === "working" ? (
          <Shimmer.Root className={styles["working-label"]}>
            {children}
          </Shimmer.Root>
        ) : (
          <span>{children}</span>
        )}
      </div>
    </Reveal>
  );
}
