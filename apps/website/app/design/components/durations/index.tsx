"use client";

import { Button, cn } from "@pond/ui";
import { useState } from "react";
import { Code } from "../code";
import { useTokenValues } from "../token-values";
import styles from "./styles.module.css";

const DURATIONS = [
  { token: "--ds-duration-fast", easing: "--ds-easing-standard" },
  { token: "--ds-duration-snap", easing: "--ds-easing-snap" },
  { token: "--ds-duration-medium", easing: "--ds-easing-standard" },
  { token: "--ds-duration-emphasized", easing: "--ds-easing-emphasized" },
  { token: "--ds-duration-slow", easing: "--ds-easing-standard" },
  { token: "--ds-duration-spring", easing: "--ds-easing-spring" },
  { token: "--ds-duration-glide", easing: "--ds-easing-glide" },
  { token: "--ds-duration-bounce", easing: "--ds-easing-bounce" },
] as const;

const TOKENS = DURATIONS.map(({ token }) => token);

interface DurationsProps extends React.ComponentPropsWithoutRef<"div"> {}

export function Durations({ className, ...props }: DurationsProps) {
  const [ref, values] = useTokenValues<HTMLDivElement>(TOKENS);
  const [played, setPlayed] = useState(false);

  return (
    <div ref={ref} className={cn(styles.durations, className)} {...props}>
      <Button
        variant="secondary"
        size="sm"
        className={styles.play}
        onClick={() => setPlayed((value) => !value)}
      >
        Play
      </Button>
      <ul className={styles.list}>
        {DURATIONS.map(({ token, easing }) => (
          <li key={token} className={styles.row}>
            <Code.Inline>{token}</Code.Inline>
            <span className={styles.value}>{values[token] || "—"}</span>
            <span
              className={styles.track}
              data-played={played || undefined}
              title={easing}
              style={
                /** SAFETY: React forwards custom properties, but `CSSProperties` has no `--*` keys. */
                {
                  "--duration": `var(${token})`,
                  "--easing": `var(${easing})`,
                } as React.CSSProperties
              }
            >
              <span className={styles.runner}>
                <span className={styles.dot} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
