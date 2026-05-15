import { Button as Base } from "@base-ui/react/button";
import { cn } from "../lib/cn";
import styles from "./styles.module.css";

interface ButtonProps extends Base.Props {
  variant?:
    | "primary"
    | "secondary"
    | "tertiary"
    | "ghost"
    | "danger"
    | "accent";
  size?: "xs" | "sm" | "md" | "lg";
  icon?: boolean;
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  icon,
  ...props
}: ButtonProps) {
  return (
    <Base
      data-variant={variant}
      data-size={size}
      data-icon={icon ? "" : undefined}
      className={cn(styles.root, className)}
      {...props}
    />
  );
}
