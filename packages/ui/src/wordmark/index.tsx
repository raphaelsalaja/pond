import { clsx as cn } from "clsx";
import type { ComponentPropsWithoutRef, CSSProperties } from "react";
import { Logo } from "../logo";
import styles from "./styles.module.css";

export interface WordmarkProps extends ComponentPropsWithoutRef<"span"> {
  size?: number;
}

/** The mark and the name locked up together; proportions follow the launch film. */
export function Wordmark({
  size = 18,
  className,
  style,
  ...props
}: WordmarkProps) {
  return (
    <span
      className={cn(styles.root, className)}
      style={
        /** SAFETY: React forwards custom properties, but `CSSProperties` has no `--*` keys. */
        { "--wordmark-size": `${size}px`, ...style } as CSSProperties
      }
      {...props}
    >
      <Logo className={styles.mark} size={size} aria-hidden />
      <span className={styles.name}>Pond</span>
    </span>
  );
}
