import { getStroke } from "perfect-freehand";
import type { StrokePoint } from "./document";

/** Mouse and trackpad report a constant 0.5 pressure, so their strokes taper from speed instead. */
function hasRealPressure(points: ReadonlyArray<StrokePoint>): boolean {
  return points.some(([, , pressure]) => pressure !== 0.5);
}

function format(value: number): string {
  return value.toFixed(2);
}

export function strokePath(
  points: ReadonlyArray<StrokePoint>,
  size: number,
): string {
  const outline = getStroke(
    points.map((point) => [...point]),
    {
      size,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
      simulatePressure: !hasRealPressure(points),
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
