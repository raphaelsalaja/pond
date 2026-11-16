import { clsx as cn } from "clsx";
import type { ComponentPropsWithoutRef } from "react";
import styles from "./styles.module.css";

export type BadgeTone = "neutral" | "inverted" | "negative" | "accent";

interface RootProps extends ComponentPropsWithoutRef<"span"> {
  tone?: BadgeTone;
}

function Root({ className, tone = "neutral", ...props }: RootProps) {
  return (
    <span
      className={cn(styles.root, className)}
      data-tone={tone === "neutral" ? undefined : tone}
      {...props}
    />
  );
}

interface DotProps extends ComponentPropsWithoutRef<"span"> {
  tone?: BadgeTone;
}

function Dot({ className, tone = "neutral", ...props }: DotProps) {
  return (
    <span
      className={cn(styles.dot, className)}
      data-tone={tone === "neutral" ? undefined : tone}
      aria-hidden
      {...props}
    />
  );
}

export const Badge = Object.assign(Root, { Root, Dot });
