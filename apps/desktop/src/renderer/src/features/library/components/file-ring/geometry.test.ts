import { describe, expect, it } from "vitest";
import {
  RING_SIZE,
  RING_SLOTS,
  type RingSlot,
  ringHit,
  ringHitAt,
  sectorPath,
  slotAnchor,
} from "./geometry";

const CENTER = RING_SIZE / 2;
const MIDDLE_RADIUS = 123;

function at(degrees: number, radius: number) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: CENTER + radius * Math.sin(radians),
    y: CENTER - radius * Math.cos(radians),
  };
}

function middleOf(slot: RingSlot): number {
  return -30 + RING_SLOTS.indexOf(slot) * 60;
}

function pathPoints(path: string) {
  const points: { x: number; y: number }[] = [];
  const commands = path.matchAll(/([MLQAZ])([^MLQAZ]*)/g);
  for (const [, command = "", args = ""] of commands) {
    const values = args.trim().split(/\s+/).filter(Boolean).map(Number);
    const pairs = command === "A" ? values.slice(5) : values;
    for (let index = 0; index + 1 < pairs.length; index += 2) {
      points.push({ x: pairs[index] ?? 0, y: pairs[index + 1] ?? 0 });
    }
  }
  return points;
}

describe("ring hit-testing", () => {
  it("finds every sector at its middle", () => {
    for (const slot of RING_SLOTS) {
      const point = at(middleOf(slot), MIDDLE_RADIUS);
      expect(ringHit(point.x, point.y)).toBe(slot);
    }
  });

  it("puts the actions on the top arc and folders around the sides and bottom", () => {
    const north = at(0, MIDDLE_RADIUS);
    const west = at(-90, MIDDLE_RADIUS);
    const east = at(90, MIDDLE_RADIUS);
    expect(ringHit(north.x - 20, north.y)).toBe("top-left");
    expect(ringHit(north.x + 20, north.y)).toBe("top-right");
    expect(ringHit(west.x, west.y)).toBe("left");
    expect(ringHit(east.x, east.y)).toBe("right");
  });

  it("treats the center as the hub and the margins as nothing", () => {
    expect(ringHit(CENTER, CENTER)).toBe("hub");
    const gap = at(45, 70);
    expect(ringHit(gap.x, gap.y)).toBeNull();
    const rim = at(45, 176);
    expect(ringHit(rim.x, rim.y)).toBeNull();
    expect(ringHit(0, 0)).toBeNull();
  });

  it("follows the ring when it is drawn smaller on screen", () => {
    const rect = { left: 100, top: 40, width: RING_SIZE / 2 };
    const point = at(middleOf("bottom-right"), MIDDLE_RADIUS);
    const x = rect.left + point.x / 2;
    const y = rect.top + point.y / 2;
    expect(ringHitAt(x, y, rect)).toBe("bottom-right");
    expect(ringHitAt(100 + CENTER / 2, 40 + CENTER / 2, rect)).toBe("hub");
    expect(ringHitAt(10, 10, { left: 0, top: 0, width: 0 })).toBeNull();
  });
});

describe("ring drawing", () => {
  it("draws every sector inside the area that hit-tests to it", () => {
    for (const slot of RING_SLOTS) {
      const points = pathPoints(sectorPath(slot));
      expect(points.length).toBeGreaterThan(8);
      for (const point of points) {
        const dx = point.x - CENTER;
        const dy = point.y - CENTER;
        const radius = Math.hypot(dx, dy);
        const inward = (radius + (MIDDLE_RADIUS - radius) * 0.02) / radius;
        expect(ringHit(CENTER + dx * inward, CENTER + dy * inward)).toBe(slot);
      }
    }
  });

  it("anchors slot content inside its own sector", () => {
    for (const slot of RING_SLOTS) {
      const anchor = slotAnchor(slot);
      const x = (anchor.left / 100) * RING_SIZE;
      const y = (anchor.top / 100) * RING_SIZE;
      expect(ringHit(x, y)).toBe(slot);
    }
  });
});
