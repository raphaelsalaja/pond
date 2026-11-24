import { Reveal, Shimmer, Swap } from "@pond/ui";
import { useReducedMotionConfig } from "motion/react";
import type { ReactNode } from "react";
import styles from "./styles.module.css";

export function RunStatus({
  icon,
  children,
}: {
  icon?: ReactNode;
  children: string;
}) {
  const reduced = useReducedMotionConfig();
  return (
    <Reveal>
      <div
        className={styles.root}
        role="status"
        data-reduced-motion={reduced || undefined}
      >
        {icon}
        <Swap value={children} className={styles.label}>
          <Shimmer.Root className={styles["working-label"]}>
            {children}
          </Shimmer.Root>
        </Swap>
      </div>
    </Reveal>
  );
}
