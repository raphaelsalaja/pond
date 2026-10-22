import { Keyboard } from "@pond/ui";
import { type ComponentProps, Fragment } from "react";
import {
  chordGlyphs,
  type ShortcutId,
  shortcutChord,
  shortcutSequence,
  useShortcutBindings,
} from "@/shared/lib/shortcuts";
import styles from "./styles.module.css";

type Density = ComponentProps<typeof Keyboard.Cluster>["density"];

export function ShortcutKeys({
  id,
  density,
}: {
  id: ShortcutId;
  density?: Density;
}) {
  useShortcutBindings();
  const sequence = shortcutSequence(id);
  if (sequence) {
    return (
      <span className={styles.sequence} aria-hidden>
        {sequence.map((step, i) => (
          <Fragment key={step}>
            {i > 0 ? <span className={styles.then}>then</span> : null}
            <Keyboard.Cluster keys={chordGlyphs(step)} density={density} />
          </Fragment>
        ))}
      </span>
    );
  }
  const keys = shortcutChord(id);
  if (keys) {
    return <Keyboard.Cluster keys={chordGlyphs(keys)} density={density} />;
  }
  return null;
}
