import type { ReactNode } from "react";
import styles from "./styles.module.css";

interface SectionProps {
  title: string;
  line: string;
  /** How wide the body runs: the reading column, or past it for cards and grids. */
  width?: "column" | "wide";
  children: ReactNode;
}

/** A heading and its quieter second line in the reading column, then the section's body. */
export function Section({
  title,
  line,
  width = "column",
  children,
}: SectionProps) {
  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.line}>{line}</p>
      </header>
      <div className={styles.body} data-width={width}>
        {children}
      </div>
    </section>
  );
}
