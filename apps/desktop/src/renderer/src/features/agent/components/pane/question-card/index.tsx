import { IconChevronDown } from "@pond/icons";
import { Button } from "@pond/ui";
import { clsx as cn } from "clsx";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import styles from "./styles.module.css";

/**
 * The card a fish asks with, modelled on Lens's question: a heading, options as outlined rows with
 * the chosen one outlined in the accent, and a footer for the actions. Both the fish's own
 * questions and its proposals are built from these parts, so they read as one set.
 */
function Root({ className, ...props }: ComponentPropsWithoutRef<"section">) {
  return <section className={cn(styles.card, className)} {...props} />;
}

function Header({
  title,
  titleId,
  description,
}: {
  title: ReactNode;
  titleId?: string;
  description?: ReactNode;
}) {
  return (
    <div className={styles.header}>
      <div className={styles.heading}>
        <h3 id={titleId} className={styles.title}>
          {title}
        </h3>
        {description ? (
          <p className={styles.description}>{description}</p>
        ) : null}
      </div>
    </div>
  );
}

function Options({
  className,
  ...props
}: ComponentPropsWithoutRef<"fieldset">) {
  return <fieldset className={cn(styles.options, className)} {...props} />;
}

function Option({
  selected,
  shortcut,
  hint,
  aside,
  className,
  children,
  ...props
}: Omit<ComponentPropsWithoutRef<"button">, "type"> & {
  selected: boolean;
  shortcut: ReactNode;
  hint?: ReactNode;
  /** Sits beside the label, such as a Recommended badge. */
  aside?: ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(styles.option, className)}
      aria-pressed={selected}
      data-selected={selected || undefined}
      {...props}
    >
      <span className={styles.radio} aria-hidden />
      <span className={styles.body}>
        <span className={styles.label}>{children}</span>
        {hint ? <span className={styles.hint}>{hint}</span> : null}
      </span>
      {aside}
      <kbd className={styles.shortcut} aria-hidden>
        {shortcut}
      </kbd>
    </button>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <p className={styles.error} role="alert">
      {children}
    </p>
  );
}

function Footer({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn(styles.footer, className)} {...props} />;
}

/**
 * The same card, folded to one line once there's nothing to decide: what happened, a word on it, and
 * an action such as Undo at the end. When it holds more, the line unfolds to show it.
 */
function Summary({
  label,
  detail,
  action,
  muted = false,
  open = false,
  onOpenChange,
  children,
  className,
  ...props
}: Omit<ComponentPropsWithoutRef<"section">, "children"> & {
  label: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
  /** Nothing was applied, so the line steps back. */
  muted?: boolean;
  open?: boolean;
  /** Present when the line unfolds to what it settled. */
  onOpenChange?: (open: boolean) => void;
  children?: ReactNode;
}) {
  const text = (
    <span className={styles["summary-text"]}>
      <span className={styles["summary-label"]}>{label}</span>
      {detail ? (
        <span className={styles["summary-detail"]}>{detail}</span>
      ) : null}
    </span>
  );
  return (
    <section
      className={cn(styles.card, styles.summary, className)}
      data-muted={muted || undefined}
      {...props}
    >
      <div className={styles["summary-row"]}>
        {onOpenChange ? (
          <Button
            variant="bare"
            width="full"
            className={styles["summary-toggle"]}
            aria-expanded={open}
            onClick={() => onOpenChange(!open)}
          >
            {text}
            <IconChevronDown
              size={12}
              className={styles.chevron}
              data-open={open || undefined}
              aria-hidden
            />
          </Button>
        ) : (
          text
        )}
        {action ? (
          <span className={styles["summary-action"]}>{action}</span>
        ) : null}
      </div>
      {open && children ? (
        <div className={styles["summary-body"]}>{children}</div>
      ) : null}
    </section>
  );
}

export const QuestionCard = {
  Summary,
  Root,
  Header,
  Options,
  Option,
  Alert,
  Footer,
};
