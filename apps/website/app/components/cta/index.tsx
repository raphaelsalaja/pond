import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

interface CtaProps extends React.ComponentPropsWithoutRef<"a"> {
  href: string;
  variant?: "solid" | "soft" | "ghost";
  size?: "md" | "lg";
  external?: boolean;
}

export function Cta({
  className,
  variant = "solid",
  size = "md",
  external,
  ...props
}: CtaProps) {
  return (
    <a
      className={cn(styles.root, className)}
      data-variant={variant}
      data-size={size}
      target={external ? "_blank" : undefined}
      rel={external ? "noreferrer" : undefined}
      {...props}
    />
  );
}
