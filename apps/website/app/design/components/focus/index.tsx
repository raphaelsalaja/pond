"use client";

import { TokenList } from "../token-list";
import { useTokenValues } from "../token-values";
import styles from "./styles.module.css";

const NAMES = [
  "--ds-focus-outline",
  "--ds-focus-width",
  "--ds-focus-offset",
  "--ds-focus-inset",
  "--ds-border-subtle",
  "--ds-border-strong",
] as const;

export function Focus() {
  const [ref, values] = useTokenValues<HTMLDivElement>(NAMES);
  const value = (name: (typeof NAMES)[number]) => values[name] || "—";
  return (
    <div ref={ref} className={styles.groups}>
      <section className={styles.group}>
        <h3 className={styles.label}>Ring</h3>
        <TokenList.Root>
        <TokenList.Item
          visual={<span className={styles.box} data-ring="outside" />}
          title="Color"
          token="--ds-focus-outline"
          description="One ring everywhere, so a keyboard user always finds the same mark."
          value={value("--ds-focus-outline")}
        />
        <TokenList.Item
          visual={<span className={styles.box} data-ring="outside" />}
          title="Width"
          token="--ds-focus-width"
          description="A solid outline. It follows the control's own corners."
          value={value("--ds-focus-width")}
        />
        <TokenList.Item
          visual={<span className={styles.box} data-ring="outside" />}
          title="When"
          description="Keyboard focus only. A click or a tap never shows it."
          value=":focus-visible"
        />
        </TokenList.Root>
      </section>

      <section className={styles.group}>
        <h3 className={styles.label}>Gap</h3>
        <TokenList.Root>
        <TokenList.Item
          visual={<span className={styles.box} data-ring="outside" />}
          title="Outside"
          token="--ds-focus-offset"
          description="The default for buttons, links, switches and cards."
          value={value("--ds-focus-offset")}
        />
        <TokenList.Item
          visual={<span className={styles.box} data-ring="inside" />}
          title="Inside"
          token="--ds-focus-inset"
          description="Rows in a scroller, segments in a track and cells, where an outside ring would clip."
          value={value("--ds-focus-inset")}
        />
        </TokenList.Root>
      </section>

      <section className={styles.group}>
        <h3 className={styles.label}>Text Fields</h3>
        <TokenList.Root>
        <TokenList.Item
          visual={<span className={styles.field} />}
          title="At Rest"
          token="--ds-border-subtle"
          description="Text fields take a hairline edge and no ring, since typing already shows where you are."
        />
        <TokenList.Item
          visual={<span className={styles.field} data-focused="" />}
          title="Focused"
          token="--ds-border-strong"
          description="Only the edge firms up. Buttons inside the field still take the ring."
        />
        </TokenList.Root>
      </section>
    </div>
  );
}
