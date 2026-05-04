import { Popover as Base } from "@base-ui-components/react/popover";
import type { ReactNode } from "react";
import styles from "./popover.module.css";

/**
 * Generic anchored popover. Use for non-modal floating surfaces
 * (help menu, command launcher, account switchers). For modal
 * sheets prefer `<Dialog>`; for short labels prefer `<Tooltip>`.
 *
 * Composition mirrors Base UI:
 *
 *   <Popover>
 *     <PopoverTrigger render={<Button>?</Button>} />
 *     <PopoverContent align="start" side="top">
 *       <PopoverItem onClick={…}>Docs</PopoverItem>
 *     </PopoverContent>
 *   </Popover>
 */
export function Popover(props: React.ComponentProps<typeof Base.Root>) {
  return <Base.Root {...props} />;
}

export const PopoverTrigger = Base.Trigger;
export const PopoverClose = Base.Close;

interface PopoverContentProps
  extends Omit<
    React.ComponentProps<typeof Base.Positioner>,
    "className" | "children"
  > {
  children?: ReactNode;
  className?: string;
  /** Optional width override; defaults to fit-content with a 220px min. */
  width?: number | string;
}

export function PopoverContent({
  children,
  className,
  width,
  side = "bottom",
  align = "center",
  sideOffset = 8,
  ...rest
}: PopoverContentProps) {
  return (
    <Base.Portal>
      <Base.Positioner
        side={side}
        align={align}
        sideOffset={sideOffset}
        className={styles.positioner}
        {...rest}
      >
        <Base.Popup
          className={[styles.popup, className ?? ""].filter(Boolean).join(" ")}
          style={width ? { width } : undefined}
        >
          {children}
        </Base.Popup>
      </Base.Positioner>
    </Base.Portal>
  );
}

interface PopoverItemProps extends React.HTMLAttributes<HTMLButtonElement> {
  /** Leading icon slot (16×16 recommended). */
  icon?: ReactNode;
  /** Trailing keyboard shortcut hint (e.g. `⌘/`). */
  kbd?: ReactNode;
  /** Disabled item still renders but ignores clicks. */
  disabled?: boolean;
}

/**
 * Single row inside a `<PopoverContent>`. Renders as a `<button>` so it's
 * keyboard-reachable; keep onClick logic in the consumer.
 */
export function PopoverItem({
  icon,
  kbd,
  children,
  className,
  disabled,
  ...rest
}: PopoverItemProps) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      className={[styles.item, className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      {icon ? (
        <span className={styles.itemIcon} aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className={styles.itemLabel}>{children}</span>
      {kbd ? <span className={styles.itemKbd}>{kbd}</span> : null}
    </button>
  );
}

/**
 * Tiny uppercase header to break a popover into sections (e.g. the
 * "What's new" group at the bottom of the help menu).
 */
export function PopoverGroupLabel({ children }: { children: ReactNode }) {
  return <div className={styles.groupLabel}>{children}</div>;
}

export function PopoverSeparator() {
  return <hr className={styles.separator} />;
}
