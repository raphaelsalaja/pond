"use client";

import { cn } from "@pond/ui";
import { Code } from "../code";
import { useTokenValues } from "../token-values";
import styles from "./styles.module.css";

const RADII = [
  "--ds-radius-xs",
  "--ds-radius-sm",
  "--ds-radius-md",
  "--ds-radius-lg",
  "--ds-radius-xl",
  "--ds-radius-2xl",
  "--ds-radius-full",
] as const;

interface RadiiProps extends React.ComponentPropsWithoutRef<"ul"> {}

export function Radii({ className, ...props }: RadiiProps) {
  const [ref, values] = useTokenValues<HTMLUListElement>(RADII);
  return (
    <ul ref={ref} className={cn(styles.grid, className)} {...props}>
      {RADII.map((token) => (
        <li key={token} className={styles.item}>
          <span
            className={styles.swatch}
            style={{ borderRadius: `var(${token})` }}
          />
          <Code.Inline>{token}</Code.Inline>
          <span className={styles.value}>{values[token] || "—"}</span>
        </li>
      ))}
    </ul>
  );
}
