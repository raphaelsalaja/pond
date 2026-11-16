"use client";

import { TokenList } from "../token-list";
import { useTokenValues } from "../token-values";
import styles from "./styles.module.css";

const STEPS = [
  {
    token: "--ds-space-2xs",
    use: "Within a pair, like a count beside its icon or a title over its second line.",
  },
  {
    token: "--ds-space-xs",
    use: "Icon to label in chips and badges, and between menu rows.",
  },
  {
    token: "--ds-space-sm",
    use: "Icon to label in buttons and list rows.",
  },
  { token: "--ds-space-md", use: "The default gap between controls in a row." },
  {
    token: "--ds-space-lg",
    use: "Padding inside rows and fields, and between groups in a pane.",
  },
  { token: "--ds-space-xl", use: "Padding of cards, panes and dialogs." },
  { token: "--ds-space-2xl", use: "Between sections of a page or a dialog." },
] as const;

const NAMES = STEPS.map((step) => step.token);

export function Spacing() {
  const [ref, values] = useTokenValues<HTMLDivElement>(NAMES);
  return (
    <div ref={ref}>
      <TokenList.Root>
        {STEPS.map((step) => (
          <TokenList.Item
            key={step.token}
            visual={
              <span
                className={styles.bar}
                style={{ width: `var(${step.token})` }}
              />
            }
            title={values[step.token] || "—"}
            token={step.token}
            description={step.use}
          />
        ))}
      </TokenList.Root>
    </div>
  );
}
