import type { ReactNode } from "react";
import styles from "../styles.module.css";

/**
 * Shared layout primitives for every settings section. Keeps the
 * chrome consistent across both real (wired) sections and scaffold
 * placeholders so the user can't tell the underlying state apart at
 * a glance.
 */

export function SectionHeader({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <header className={styles.sectionHeader}>
      <h1 className={styles.sectionTitle}>{title}</h1>
      {description ? (
        <p className={styles.sectionDescription}>{description}</p>
      ) : null}
    </header>
  );
}

export function SectionStack({ children }: { children: ReactNode }) {
  return <div className={styles.sectionStack}>{children}</div>;
}

/**
 * A `<SettingsCard>` is a hairline-divided block that hosts one or
 * more `<Row>`s plus an optional title. Mirrors Linear's "Section"
 * grouping inside a preferences page.
 */
export function SettingsCard({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.card}>
      {title ? <h2 className={styles.groupTitle}>{title}</h2> : null}
      {children}
    </div>
  );
}

export function Row({
  label,
  description,
  control,
}: {
  label: ReactNode;
  description?: ReactNode;
  control: ReactNode;
}) {
  return (
    <div className={styles.row}>
      <div className={styles.rowMeta}>
        <span className={styles.rowLabel}>{label}</span>
        {description ? (
          <span className={styles.rowDescription}>{description}</span>
        ) : null}
      </div>
      <div className={styles.rowControl}>{control}</div>
    </div>
  );
}

/**
 * A row that takes a full-width control (e.g. a textarea, a long
 * input + buttons) instead of putting the control on the right side.
 * Stacks label/description above the control.
 */
export function StackedRow({
  label,
  description,
  children,
}: {
  label?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className={styles.stackedRow}>
      {label ? <span className={styles.rowLabel}>{label}</span> : null}
      {description ? (
        <span className={styles.rowDescription}>{description}</span>
      ) : null}
      <div className={styles.stackedControl}>{children}</div>
    </div>
  );
}
