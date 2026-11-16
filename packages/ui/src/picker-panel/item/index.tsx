import {
  IconCheck as Check,
  IconChevronRight as ChevronRight,
} from "@pond/icons";
import { clsx as cn } from "clsx";
import { Fragment } from "react";
import styles from "./styles.module.css";

export type PickerSelectionState = "checked" | "mixed" | "unchecked";

const SELECTABLE_ROLES = new Set(["option", "treeitem", "gridcell", "row"]);

interface ItemProps extends React.ComponentProps<"button"> {
  active?: boolean;
  /** `active` fills only the active row, for lists whose pointer moves the active row. */
  highlight?: "hover" | "active";
  selected?: PickerSelectionState;
}

export function Item({
  active,
  className,
  highlight = "hover",
  role = "option",
  selected = "unchecked",
  "aria-selected": ariaSelected,
  onMouseDown,
  ...props
}: ItemProps) {
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-selected is only set for SELECTABLE_ROLES, which all support it.
    <button
      {...props}
      type="button"
      role={role}
      tabIndex={-1}
      aria-selected={
        ariaSelected ??
        (SELECTABLE_ROLES.has(role) ? selected === "checked" : undefined)
      }
      data-active={active ? "" : undefined}
      data-highlighted={active ? "" : undefined}
      data-highlight={highlight === "active" ? highlight : undefined}
      data-selection={selected}
      className={cn(styles.item, className)}
      onMouseDown={(event) => {
        event.preventDefault();
        onMouseDown?.(event);
      }}
    />
  );
}

export function SelectionMark({
  state = "unchecked",
}: {
  state?: PickerSelectionState;
}) {
  return (
    <span
      aria-hidden="true"
      className={styles["selection-mark"]}
      data-selection={state}
    >
      {state === "checked" ? <Check size={12} /> : null}
    </span>
  );
}

export function ItemIcon({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return <span {...props} className={cn(styles.icon, className)} />;
}

interface ItemLabelProps extends React.ComponentProps<"span"> {
  path?: readonly string[];
}

export function ItemLabel({
  path,
  className,
  children,
  ...props
}: ItemLabelProps) {
  const crumbs = path?.length ? path : null;
  return (
    <span
      {...props}
      data-slot="picker-label"
      data-path={crumbs ? "" : undefined}
      className={cn(styles.label, className)}
    >
      {crumbs ? (
        <span className={styles.trail}>
          {crumbs.map((segment, index, segments) => (
            <Fragment key={segments.slice(0, index + 1).join("/")}>
              <span className={styles.crumb}>{segment}</span>
              <ChevronRight
                size={12}
                className={styles.separator}
                aria-hidden="true"
              />
            </Fragment>
          ))}
        </span>
      ) : null}
      {crumbs ? <span className={styles.name}>{children}</span> : children}
    </span>
  );
}

export function ItemMeta({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return <span {...props} className={cn(styles.meta, className)} />;
}
