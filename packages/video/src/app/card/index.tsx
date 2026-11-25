import type { CSSProperties } from "react";
import { Handles } from "../handles";
import type { Side } from "../handles";
import styles from "./styles.module.css";

/** Height of a save card's title and domain row. */
const CAPTION = 54;

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A save card's frame on the board, from its width and image aspect. */
export const cardBox = (
  x: number,
  y: number,
  width: number,
  aspect: number,
): Box => ({
  x,
  y,
  width,
  height: Math.round(width / aspect) + CAPTION,
});

interface CardProps {
  box: Box;
  src: string;
  title: string;
  meta?: string;
  selected?: boolean;
  handles?: number;
  activeHandle?: Side;
  /** Entry motion, such as a drop-in. */
  style?: CSSProperties;
}

/** A save on a canvas: its thumbnail over a title and domain, as the board's save card draws it. */
export function Card({
  box,
  src,
  title,
  meta,
  selected,
  handles = 0,
  activeHandle,
  style,
}: CardProps) {
  return (
    <div
      className={styles.card}
      data-selected={selected || undefined}
      style={{
        left: box.x,
        top: box.y,
        width: box.width,
        height: box.height,
        ...style,
      }}
    >
      <Handles opacity={handles} active={activeHandle} />
      <div className={styles.media}>
        <img className={styles.image} src={src} alt="" />
      </div>
      <div className={styles.caption} style={{ height: CAPTION }}>
        <span className={styles.title}>{title}</span>
        {meta ? <span className={styles.meta}>{meta}</span> : null}
      </div>
    </div>
  );
}
