import { Toggle as Base } from "@base-ui/react/toggle";
import { clsx as cn } from "clsx";
import type { IconName } from "../button";
import { pop } from "../shared/pop";
import styles from "./styles.module.css";

export interface ToggleProps extends Base.Props {
  size?: "sm" | "md";
  variant?: "ghost" | "outline";
  /** Square icon-only toggle. Requires `aria-label` or `aria-labelledby`. */
  icon?: boolean;
}

export function Toggle<Icon extends boolean | undefined = undefined>(
  props: Omit<ToggleProps, "icon"> & { icon?: Icon } & IconName<Icon>,
): React.JSX.Element;
export function Toggle({
  className,
  size = "md",
  variant = "ghost",
  icon,
  onClick,
  ...props
}: ToggleProps) {
  return (
    <Base
      data-size={size}
      data-variant={variant}
      data-icon={icon || undefined}
      className={cn(styles.root, className)}
      onClick={(event) => {
        pop(event.currentTarget.querySelector(":scope > svg"));
        onClick?.(event);
      }}
      {...props}
    />
  );
}
