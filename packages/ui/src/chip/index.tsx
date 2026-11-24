import { IconXmark } from "@pond/icons";
import { clsx as cn } from "clsx";
import type {
  ComponentProps,
  ComponentPropsWithoutRef,
  ReactNode,
} from "react";
import { Button, type ButtonProps } from "../button";
import { cssVars } from "../css-vars";
import { Menu } from "../menu";
import { Action, Clear, Item, Link } from "./item";
import styles from "./styles.module.css";

export type { ChipTone } from "./item";

interface RootProps extends ComponentPropsWithoutRef<"div"> {}

function Root({ className, ...props }: RootProps) {
  return <div className={cn(styles.root, className)} {...props} />;
}

interface IconProps extends ComponentPropsWithoutRef<"span"> {}

function Icon({ className, ...props }: IconProps) {
  return <span className={cn(styles.icon, className)} aria-hidden {...props} />;
}

interface LabelProps extends ComponentPropsWithoutRef<"span"> {
  width?: "capped" | "auto";
}

function Label({ className, width = "capped", ...props }: LabelProps) {
  return (
    <span
      className={cn(styles.label, className)}
      data-width={width === "auto" ? width : undefined}
      {...props}
    />
  );
}

function Operator({
  className,
  size = "xs",
  variant = "ghost",
  ...props
}: ButtonProps) {
  return (
    <Button
      size={size}
      variant={variant}
      className={cn(styles.operator, className)}
      {...props}
    />
  );
}

function Trigger({
  className,
  size = "sm",
  variant = "ghost",
  ...props
}: ButtonProps) {
  return (
    <Button
      size={size}
      variant={variant}
      className={cn(styles.trigger, className)}
      {...props}
    />
  );
}

interface SwatchProps extends ComponentPropsWithoutRef<"span"> {
  color?: string;
  /** Set on swatches in a picker; omit for display-only swatches. */
  selected?: boolean;
}

function Swatch({ color, selected, className, style, ...props }: SwatchProps) {
  return (
    <span
      className={cn(styles.swatch, className)}
      data-spectrum={color ? undefined : ""}
      data-swatch={color}
      data-selectable={selected === undefined ? undefined : ""}
      data-selected={selected || undefined}
      style={
        color ? { ...style, ...cssVars({ "--swatch-color": color }) } : style
      }
      aria-hidden
      {...props}
    />
  );
}

interface FilterProps
  extends Omit<ComponentPropsWithoutRef<"div">, "children"> {
  icon: ReactNode;
  label: ReactNode;
  title?: string;
  active?: boolean;
  ariaLabel: string;
  variant?: ButtonProps["variant"];
  clearLabel?: string;
  onClear?: () => void;
  onOpenChange?: ComponentProps<typeof Menu.Root>["onOpenChange"];
  search?: Omit<ComponentProps<typeof Menu.FilterProvider>, "children">;
  children: ReactNode;
}

function Filter({
  icon,
  label,
  title,
  active,
  ariaLabel,
  variant = "ghost",
  clearLabel = "Clear Filter",
  onClear,
  onOpenChange,
  search,
  children,
  className,
  ...props
}: FilterProps) {
  const root = (
    <Menu.Root onOpenChange={onOpenChange}>
      <Menu.Trigger
        size="sm"
        variant={variant}
        className={styles["filter-trigger"]}
        data-active={active || undefined}
        aria-label={ariaLabel}
        title={title ?? ariaLabel}
      >
        <span className={styles["filter-icon"]} aria-hidden>
          {icon}
        </span>
        <span className={styles["filter-label"]}>{label}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="bottom" align="start" sideOffset={6}>
          {children}
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
  return (
    <div className={cn(styles.filter, className)} {...props}>
      {search ? (
        <Menu.FilterProvider {...search}>{root}</Menu.FilterProvider>
      ) : (
        root
      )}
      {active && onClear ? (
        <Button
          icon
          size="xs"
          variant="primary"
          className={styles["filter-clear"]}
          aria-label={clearLabel}
          onClick={onClear}
        >
          <IconXmark
            size={12}
            className={styles["filter-clear-icon"]}
          />
        </Button>
      ) : null}
    </div>
  );
}

interface PopupProps extends ComponentProps<typeof Menu.Popup> {}

function Popup({ className, ...props }: PopupProps) {
  return <Menu.Popup className={cn(styles.popup, className)} {...props} />;
}

export const Chip = {
  Root,
  Item,
  Action,
  Link,
  Icon,
  Label,
  Operator,
  Trigger,
  Clear,
  Swatch,
  Filter,
  Popup,
};
