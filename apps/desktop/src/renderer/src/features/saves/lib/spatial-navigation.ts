export interface ResultRectangle {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

export type ResultDirection =
  | "left"
  | "right"
  | "up"
  | "down"
  | "page-up"
  | "page-down";

export function spatialNeighbor(
  items: ReadonlyArray<ResultRectangle>,
  id: string,
  direction: ResultDirection,
  pageHeight: number,
): string | null {
  const current = items.find((item) => item.id === id);
  if (!current) {
    return null;
  }
  const horizontal = direction === "left" || direction === "right";
  const forward =
    direction === "right" || direction === "down" || direction === "page-down";
  const page = direction === "page-up" || direction === "page-down";
  const centerX = current.left + current.width / 2;
  const centerY = current.top + current.height / 2;
  let best: ResultRectangle | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const item of items) {
    if (item.id === id) {
      continue;
    }
    const dx = item.left + item.width / 2 - centerX;
    const dy = item.top + item.height / 2 - centerY;
    const distance = horizontal ? dx : dy;
    if (forward ? distance <= 0.5 : distance >= -0.5) {
      continue;
    }
    const overlap = horizontal
      ? item.top < current.top + current.height &&
        item.top + item.height > current.top
      : item.left < current.left + current.width &&
        item.left + item.width > current.left;
    const cross = Math.abs(horizontal ? dy : dx);
    const travel = page
      ? Math.abs(Math.abs(distance) - pageHeight)
      : Math.abs(distance);
    const score = (overlap ? 0 : 1_000_000) + travel + cross * 2;
    if (score < bestScore) {
      best = item;
      bestScore = score;
    }
  }
  return best?.id ?? null;
}

export function intersectingResults(
  items: ReadonlyArray<ResultRectangle>,
  rectangle: Omit<ResultRectangle, "id">,
): Array<string> {
  return items.flatMap((item) =>
    item.left < rectangle.left + rectangle.width &&
    item.left + item.width > rectangle.left &&
    item.top < rectangle.top + rectangle.height &&
    item.top + item.height > rectangle.top
      ? [item.id]
      : [],
  );
}
