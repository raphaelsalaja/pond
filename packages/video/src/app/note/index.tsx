import type { CSSProperties } from "react";
import { NOTE_FILL } from "../board/colors";
import type { CanvasColor } from "../board/colors";
import type { Box } from "../card";
import { Handles } from "../handles";
import type { Side } from "../handles";
import styles from "./styles.module.css";

interface NoteProps {
  box: Box;
  color: CanvasColor;
  text: string;
  /** Shows the text caret, for typing. */
  caret?: boolean;
  selected?: boolean;
  handles?: number;
  activeHandle?: Side;
  style?: CSSProperties;
}

/** A sticky note on a canvas. */
export function Note({
  box,
  color,
  text,
  caret,
  selected,
  handles = 0,
  activeHandle,
  style,
}: NoteProps) {
  return (
    <div
      className={styles.note}
      data-selected={selected || undefined}
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        background: NOTE_FILL[color],
        ...style,
      }}
    >
      <Handles opacity={handles} active={activeHandle} />
      <p className={styles.body}>
        {text}
        {caret ? <span className={styles.caret} /> : null}
      </p>
    </div>
  );
}
