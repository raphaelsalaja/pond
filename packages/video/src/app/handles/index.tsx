import styles from "./styles.module.css";

export type Side = "top" | "right" | "bottom" | "left";

const SIDES: Array<Side> = ["top", "right", "bottom", "left"];

interface HandlesProps {
  opacity: number;
  /** The side a connection is being dragged from; it fills in. */
  active?: Side;
}

/** The four connection dots a canvas item shows on hover, floating just off each edge. */
export function Handles({ opacity, active }: HandlesProps) {
  if (opacity <= 0.002) {
    return null;
  }
  return SIDES.map((side) => (
    <span
      key={side}
      className={styles.handle}
      data-side={side}
      data-active={side === active || undefined}
      style={{ opacity }}
    />
  ));
}
