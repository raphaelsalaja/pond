import { getStroke } from "perfect-freehand";
import { INK } from "../board/colors";
import type { CanvasColor } from "../board/colors";
import styles from "./styles.module.css";

export type StrokePoint = [x: number, y: number, pressure: number];

const format = (value: number) => value.toFixed(2);

/** The marker's filled outline, with the board's perfect-freehand settings for a mouse. */
function strokePath(points: ReadonlyArray<StrokePoint>, size: number) {
  const outline = getStroke(
    points.map((point) => [...point]),
    {
      size,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: true,
    },
  );
  const [startX, startY] = outline[0] ?? [];
  if (startX === undefined || startY === undefined) return "";
  const curves = outline.map(([x = 0, y = 0], index) => {
    const [nextX = x, nextY = y] = outline[(index + 1) % outline.length] ?? [];
    return `${format(x)} ${format(y)} ${format((x + nextX) / 2)} ${format((y + nextY) / 2)}`;
  });
  return `M ${format(startX)} ${format(startY)} Q ${curves.join(" ")} Z`;
}

interface StrokeProps {
  points: ReadonlyArray<StrokePoint>;
  /** How much of the stroke has been drawn, 0 to 1. */
  progress?: number;
  color: CanvasColor;
  size?: number;
}

/** A marker drawing on a canvas, drawn on point by point. */
export function Stroke({ points, progress = 1, color, size = 4 }: StrokeProps) {
  const count = Math.round(points.length * progress);
  if (count < 2) return null;
  return (
    <svg className={styles.stroke} aria-hidden>
      <path d={strokePath(points.slice(0, count), size)} fill={INK[color]} />
    </svg>
  );
}
