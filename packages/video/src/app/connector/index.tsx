import { type CanvasColor, INK } from "../board/colors";
import type { Box } from "../card";
import type { Side } from "../handles";
import styles from "./styles.module.css";

export interface End {
  x: number;
  y: number;
  side: Side;
}

/** Where a connector meets `box` on `side`: the outer edge of that side's handle. */
export function anchor(box: Box, side: Side): End {
  const out = 16;
  if (side === "top") return { x: box.x + box.width / 2, y: box.y - out, side };
  if (side === "bottom")
    return { x: box.x + box.width / 2, y: box.y + box.height + out, side };
  if (side === "left")
    return { x: box.x - out, y: box.y + box.height / 2, side };
  return { x: box.x + box.width + out, y: box.y + box.height / 2, side };
}

const OPPOSITE = {
  top: "bottom",
  right: "left",
  bottom: "top",
  left: "right",
} as const;

/** React Flow's bezier control offset at curvature 0.25. */
const offset = (distance: number) =>
  distance >= 0 ? 0.5 * distance : 0.25 * 25 * Math.sqrt(-distance);

function control(end: End, other: { x: number; y: number }) {
  if (end.side === "left") return [end.x - offset(end.x - other.x), end.y];
  if (end.side === "right") return [end.x + offset(other.x - end.x), end.y];
  if (end.side === "top") return [end.x, end.y - offset(end.y - other.y)];
  return [end.x, end.y + offset(other.y - end.y)];
}

interface ConnectorProps {
  id: string;
  from: End;
  /** The far end. A bare point is a connection still being dragged. */
  to: End | { x: number; y: number };
  /** How much of the line is drawn, 0 to 1. */
  progress?: number;
  color?: CanvasColor;
}

/** A curved canvas connector with its arrowhead, or the accent line while one is being dragged out. */
export function Connector({
  id,
  from,
  to,
  progress = 1,
  color = "gray",
}: ConnectorProps) {
  const pending = !("side" in to);
  const target: End = "side" in to ? to : { ...to, side: OPPOSITE[from.side] };
  const [c1x, c1y] = control(from, target);
  const [c2x, c2y] = control(target, from);
  const path = `M${from.x} ${from.y} C${c1x} ${c1y} ${c2x} ${c2y} ${target.x} ${target.y}`;
  const ink = pending ? "var(--ds-accent)" : INK[color];
  return (
    <svg className={styles.connector} aria-hidden>
      <defs>
        <marker
          id={`${id}-arrow`}
          viewBox="0 0 12 12"
          refX={10}
          refY={6}
          markerWidth={12}
          markerHeight={12}
          markerUnits="userSpaceOnUse"
          orient="auto-start-reverse"
        >
          <path
            className={styles.arrow}
            d="M2.5 2L10 6L2.5 10"
            style={{ stroke: ink }}
          />
        </marker>
      </defs>
      <path
        className={styles.line}
        d={path}
        pathLength={1}
        strokeDasharray={progress < 1 ? "1 1" : undefined}
        strokeDashoffset={progress < 1 ? 1 - progress : undefined}
        markerEnd={pending || progress < 1 ? undefined : `url(#${id}-arrow)`}
        style={{ stroke: ink }}
      />
    </svg>
  );
}
