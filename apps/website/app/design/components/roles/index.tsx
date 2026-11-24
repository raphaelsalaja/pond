"use client";

import { cn } from "@pond/ui";
import { useId, useLayoutEffect, useRef, useState } from "react";
import { contrast, luminance } from "../contrast";
import { useTheme } from "../theme";
import styles from "./styles.module.css";

interface RolesProps extends React.ComponentPropsWithoutRef<"section"> {
  label: string;
  roles: ReadonlyArray<string>;
}

export function Roles({ label, roles, className, ...props }: RolesProps) {
  const id = useId();
  const { theme } = useTheme();
  const ref = useRef<HTMLElement>(null);
  const [ratios, setRatios] = useState<ReadonlyArray<number | null>>([]);

  useLayoutEffect(() => {
    const root = ref.current;
    const probe = root?.querySelector<HTMLElement>("[data-probe]");
    if (!root || !probe) {
      return;
    }
    const base = luminance(getComputedStyle(probe).backgroundColor);
    const swatches = root.querySelectorAll<HTMLElement>("[data-swatch]");
    setRatios(
      Array.from(swatches, (swatch) => {
        const value = luminance(getComputedStyle(swatch).backgroundColor);
        return base === null || value === null ? null : contrast(value, base);
      }),
    );
  }, [theme, roles]);

  return (
    <section
      ref={ref}
      aria-labelledby={id}
      className={cn(styles.roles, className)}
      {...props}
    >
      <span data-probe="" aria-hidden="true" className={styles.probe} />
      <h3 id={id} className={styles.label}>
        {label}
      </h3>
      <ol className={styles.list}>
        {roles.map((role, index) => {
          const token = `--ds-${role}`;
          const ratio = ratios[index];
          return (
            <li key={token} className={styles.role} title={token}>
              <span
                data-swatch=""
                className={styles.swatch}
                style={{ background: `var(${token})` }}
              />
              <span className={styles.name}>{role}</span>
              <span className={styles.ratio}>
                {ratio === null || ratio === undefined
                  ? "—"
                  : `${ratio.toFixed(2)}:1`}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
