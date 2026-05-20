import type { ReactNode } from "react";
import styles from "../styles.module.css";

interface CellProps {
  label: string;
  children: ReactNode;
}

export function Cell({ label, children }: CellProps) {
  return (
    <div className={styles.cell}>
      <span className={styles["cell-label"]}>{label}</span>
      <div className={styles["cell-preview"]}>
        <div className={styles.stack}>{children}</div>
      </div>
    </div>
  );
}
