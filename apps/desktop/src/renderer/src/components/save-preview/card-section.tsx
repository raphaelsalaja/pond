import type { ReactNode } from "react";
import styles from "./card-section.module.css";

export function CardSection({
  label,
  children,
  className,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={className ? `${styles.card} ${className}` : styles.card}
    >
      {label ? <h3 className={styles["card-header"]}>{label}</h3> : null}
      {children}
    </section>
  );
}
