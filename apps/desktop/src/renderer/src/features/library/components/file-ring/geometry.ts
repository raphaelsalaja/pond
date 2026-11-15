export const RING_SIZE = 360;
export const HUB_RADIUS = 64;

const CENTER = RING_SIZE / 2;
const INNER_RADIUS = 74;
const OUTER_RADIUS = 172;
const GAP = 6;
const CORNER = 14;
const SECTOR_DEGREES = 60;
const FIRST_SECTOR_START = -60;

/** Clockwise from the top-left action, one 60° sector each. */
export const RING_SLOTS = [
  "top-left",
  "top-right",
  "right",
  "bottom-right",
  "bottom-left",
  "left",
] as const;

export type RingSlot = (typeof RING_SLOTS)[number];

export type RingHit = RingSlot | "hub" | null;

interface Point {
  x: number;
  y: number;
}

interface RingRect {
  left: number;
  top: number;
  width: number;
}

function polar(radius: number, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.sin(radians),
    y: CENTER - radius * Math.cos(radians),
  };
}

function toward(from: Point, to: Point, distance: number): Point {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const t = distance / length;
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

function sweep(distance: number, radius: number): number {
  return (distance / radius) * (180 / Math.PI);
}

function slotBounds(slot: RingSlot) {
  const start = FIRST_SECTOR_START + RING_SLOTS.indexOf(slot) * SECTOR_DEGREES;
  return { start, end: start + SECTOR_DEGREES };
}

/** Hit-tests a point in ring units, where the ring spans 0 to `RING_SIZE` on both axes. */
export function ringHit(x: number, y: number): RingHit {
  const dx = x - CENTER;
  const dy = y - CENTER;
  const distance = Math.hypot(dx, dy);
  if (distance <= HUB_RADIUS) return "hub";
  if (distance < INNER_RADIUS || distance > OUTER_RADIUS) return null;
  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const turned = (((degrees - FIRST_SECTOR_START) % 360) + 360) % 360;
  return RING_SLOTS[Math.floor(turned / SECTOR_DEGREES)] ?? null;
}

/** Maps a pointer to the ring through its on-screen box, so a scaled ring still hits its drawn sectors. */
export function ringHitAt(
  clientX: number,
  clientY: number,
  rect: RingRect,
): RingHit {
  if (rect.width <= 0) return null;
  const scale = rect.width / RING_SIZE;
  return ringHit((clientX - rect.left) / scale, (clientY - rect.top) / scale);
}

export function sectorPath(slot: RingSlot): string {
  const { start, end } = slotBounds(slot);
  const inset = (radius: number) =>
    (Math.asin(GAP / 2 / radius) * 180) / Math.PI;
  const innerStart = start + inset(INNER_RADIUS);
  const innerEnd = end - inset(INNER_RADIUS);
  const outerStart = start + inset(OUTER_RADIUS);
  const outerEnd = end - inset(OUTER_RADIUS);
  const p1 = polar(INNER_RADIUS, innerStart);
  const p2 = polar(OUTER_RADIUS, outerStart);
  const p3 = polar(OUTER_RADIUS, outerEnd);
  const p4 = polar(INNER_RADIUS, innerEnd);
  const outerCorner = sweep(CORNER, OUTER_RADIUS);
  const innerCorner = sweep(CORNER, INNER_RADIUS);
  const at = (point: Point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  return [
    `M ${at(toward(p1, p2, CORNER))}`,
    `L ${at(toward(p2, p1, CORNER))}`,
    `Q ${at(p2)} ${at(polar(OUTER_RADIUS, outerStart + outerCorner))}`,
    `A ${OUTER_RADIUS} ${OUTER_RADIUS} 0 0 1 ${at(polar(OUTER_RADIUS, outerEnd - outerCorner))}`,
    `Q ${at(p3)} ${at(toward(p3, p4, CORNER))}`,
    `L ${at(toward(p4, p3, CORNER))}`,
    `Q ${at(p4)} ${at(polar(INNER_RADIUS, innerEnd - innerCorner))}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 0 0 ${at(polar(INNER_RADIUS, innerStart + innerCorner))}`,
    `Q ${at(p1)} ${at(toward(p1, p2, CORNER))}`,
    "Z",
  ].join(" ");
}

/** Where a slot's content sits, as percentages of the ring box. */
export function slotAnchor(slot: RingSlot) {
  const { start, end } = slotBounds(slot);
  const point = polar((INNER_RADIUS + OUTER_RADIUS) / 2, (start + end) / 2);
  return {
    left: (point.x / RING_SIZE) * 100,
    top: (point.y / RING_SIZE) * 100,
  };
}
