import type { ReactNode } from "react";
import styles from "./styles.module.css";

export interface CtaProps {
  href: string;
  children: ReactNode;
  variant?: "solid" | "outline" | "tertiary";
  size?: "md" | "sm";
  /** Stretches to its container, for the buttons at the foot of a card. */
  block?: boolean;
}

export function Cta({
  href,
  children,
  variant = "solid",
  size = "md",
  block = false,
}: CtaProps) {
  return (
    <a
      className={styles.root}
      data-variant={variant}
      data-size={size}
      data-block={block || undefined}
      href={href}
    >
      {children}
    </a>
  );
}
