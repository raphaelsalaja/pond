import { Toolbar as Base } from "@base-ui-components/react/toolbar";
import type { ReactNode } from "react";
import { Button, type ButtonProps } from "./button";
import styles from "./toolbar.module.css";

interface ToolbarProps {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}

/**
 * Toolbar root. A horizontal grouping of buttons / actions with
 * arrow-key roving focus (Base UI handles that for us).
 */
export function Toolbar({
  children,
  className,
  "aria-label": ariaLabel,
}: ToolbarProps) {
  return (
    <Base.Root
      aria-label={ariaLabel}
      className={[styles.toolbar, className ?? ""].filter(Boolean).join(" ")}
    >
      {children}
    </Base.Root>
  );
}

/** Button rendered inside a toolbar. Accepts the same props as `<Button>`. */
export function ToolbarButton({
  variant = "ghost",
  size = "md",
  ...rest
}: ButtonProps) {
  return (
    <Base.Button render={<Button variant={variant} size={size} {...rest} />} />
  );
}

/** Visual divider between toolbar groups. */
export function ToolbarSeparator() {
  return <Base.Separator className={styles.separator} />;
}

/** Container that flex-grows / shrinks groups within the toolbar. */
export function ToolbarGroup({
  children,
  align = "start",
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
}) {
  return (
    <div className={`${styles.group} ${styles[`group-${align}`]}`}>
      {children}
    </div>
  );
}
