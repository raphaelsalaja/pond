"use client";

import { useId } from "react";
import { TokenList } from "../token-list";
import { useTokenValues } from "../token-values";
import styles from "./styles.module.css";

const SIZES = [
  { name: "micro", use: "Keycaps and labels on dense previews." },
  {
    name: "small",
    use: "Small controls, badges, tooltips, shortcuts and table headers.",
  },
  {
    name: "body",
    use: "The default for body text, rows, menu items and buttons.",
  },
  {
    name: "heading",
    use: "Dialog titles, changelog headings and error screens.",
  },
  { name: "title", use: "Pane and viewer titles." },
  {
    name: "display",
    use: "Settings page titles and large text in viewers and canvas.",
  },
] as const;

const WEIGHTS = [
  { name: "regular", use: "Body text, menu items and field values." },
  { name: "medium", use: "Buttons, badges, labels and table cells." },
  { name: "strong", use: "Headings, dialog titles and keycaps." },
  { name: "semibold", use: "Emphasis that needs more weight than strong." },
  { name: "bold", use: "The wordmark and file icon labels." },
] as const;

const NAMES = [
  ...SIZES.flatMap((size) => [
    `--ds-text-${size.name}`,
    `--ds-leading-${size.name}`,
  ]),
  ...WEIGHTS.map((weight) => `--ds-weight-${weight.name}`),
  "--ds-font-mono",
];

const first = (stack: string | undefined) =>
  stack?.split(",")[0]?.trim().replaceAll('"', "") || "—";

interface GroupProps {
  label: string;
  children: React.ReactNode;
}

function Group({ label, children }: GroupProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={styles.group}>
      <h3 id={id} className={styles.label}>
        {label}
      </h3>
      <TokenList.Root>{children}</TokenList.Root>
    </section>
  );
}

export function Typography() {
  const [ref, values] = useTokenValues<HTMLDivElement>(NAMES);
  return (
    <div ref={ref} className={styles.typography}>
      <Group label="Size">
        {SIZES.map((size) => {
          const token = `--ds-text-${size.name}`;
          const leading = values[`--ds-leading-${size.name}`];
          return (
            <TokenList.Item
              key={size.name}
              visual={
                <span
                  className={styles.sample}
                  style={{ fontSize: `var(${token})` }}
                >
                  Aa
                </span>
              }
              title={values[token] || "—"}
              token={token}
              description={size.use}
              value={leading && `${leading} leading`}
            />
          );
        })}
      </Group>

      <Group label="Weight">
        {WEIGHTS.map((weight) => {
          const token = `--ds-weight-${weight.name}`;
          return (
            <TokenList.Item
              key={weight.name}
              visual={
                <span
                  className={styles.sample}
                  data-display=""
                  style={{ fontWeight: `var(${token})` }}
                >
                  Aa
                </span>
              }
              title={values[token] || "—"}
              token={token}
              description={weight.use}
            />
          );
        })}
      </Group>

      <Group label="Family">
        <TokenList.Item
          visual={
            <span className={styles.sample} data-display="">
              Aa
            </span>
          }
          title="Sans"
          description="Every interface string. Its optical size follows the font size, and Inter fills in symbols, Greek and Cyrillic."
          value="Allo"
        />
        <TokenList.Item
          visual={
            <span className={styles.sample} data-display="" data-mono="">
              Aa
            </span>
          }
          title="Mono"
          token="--ds-font-mono"
          description="Code, token names, file sizes and other aligned figures."
          value={first(values["--ds-font-mono"])}
        />
      </Group>
    </div>
  );
}
