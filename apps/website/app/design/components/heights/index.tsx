"use client";

import { TokenList } from "../token-list";
import { useTokenValues } from "../token-values";
import styles from "./styles.module.css";

const HEIGHTS = [
  {
    token: "--ds-size-xs",
    title: "Extra Small",
    use: "Toolbars, chips and dense tables.",
  },
  {
    token: "--ds-size-sm",
    title: "Small",
    use: "Buttons and fields inside panes and menus.",
  },
  {
    token: "--ds-size-md",
    title: "Medium",
    use: "The default button and field, used in forms and dialogs.",
  },
] as const;

const NAMES = HEIGHTS.map((height) => height.token);

export function Heights() {
  const [ref, values] = useTokenValues<HTMLDivElement>(NAMES);
  return (
    <div ref={ref}>
      <TokenList.Root>
        {HEIGHTS.map((height) => (
          <TokenList.Item
            key={height.token}
            visual={
              <span
                className={styles.box}
                style={{ height: `var(${height.token})` }}
              />
            }
            title={height.title}
            token={height.token}
            description={height.use}
            value={values[height.token] || "—"}
          />
        ))}
      </TokenList.Root>
    </div>
  );
}
