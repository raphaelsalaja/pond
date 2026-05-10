import { Button as Base } from "@base-ui/react/button";
import styles from "./styles.module.css";

interface RootProps extends React.ComponentProps<typeof Base> {
  variant?: "primary" | "secondary" | "tertiary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  icon?: boolean;
}

export function Button({
  className,
  variant,
  size,
  icon,
  ...props
}: RootProps) {
  return (
    <Base
      data-variant={variant}
      data-size={size}
      data-icon={icon ? "" : undefined}
      className={[styles.root, className ?? ""].filter(Boolean).join(" ")}
      {...props}
    />
  );
}
