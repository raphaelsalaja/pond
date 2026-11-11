import { describe, expect, it } from "vitest";
import {
  boardBounds,
  centeredOn,
  fitFrame,
  grabOffset,
  toBoard,
  toMap,
  viewportAt,
  visibleArea,
} from "./minimap";

const SCREEN = { width: 800, height: 600 };
const MAP = { width: 200, height: 140 };

describe("visibleArea", () => {
  it("returns the board rectangle the screen shows", () => {
    expect(visibleArea({ x: 40, y: -20, zoom: 1 }, SCREEN)).toEqual({
      x: -40,
      y: 20,
      width: 800,
      height: 600,
    });
    expect(visibleArea({ x: -200, y: 100, zoom: 2 }, SCREEN)).toEqual({
      x: 100,
      y: -50,
      width: 400,
      height: 300,
    });
  });
});

describe("boardBounds", () => {
  it("covers every item and the visible area", () => {
    const visible = { x: 0, y: 0, width: 100, height: 100 };
    expect(
      boardBounds(
        [
          { x: -50, y: 20, width: 10, height: 10 },
          { x: 300, y: 400, width: 20, height: 30 },
        ],
        visible,
      ),
    ).toEqual({ x: -50, y: 0, width: 370, height: 430 });
  });

  it("falls back to the visible area on an empty board", () => {
    const visible = { x: 10, y: 20, width: 30, height: 40 };
    expect(boardBounds([], visible)).toEqual(visible);
  });
});

describe("fitFrame", () => {
  it("fits the wider axis inside the padding and centers the other", () => {
    const frame = fitFrame({ x: 0, y: 0, width: 1000, height: 200 }, MAP, 10);
    expect(frame.scale).toBeCloseTo(0.18);
    expect(frame.offset.x).toBeCloseTo(10);
    expect(frame.offset.y).toBeCloseTo((140 - 36) / 2);
  });

  it("stays finite for empty bounds", () => {
    const frame = fitFrame({ x: 5, y: 5, width: 0, height: 0 }, MAP, 10);
    expect(Number.isFinite(frame.scale)).toBe(true);
    expect(frame.scale).toBeGreaterThan(0);
  });
});

describe("toMap and toBoard", () => {
  const frame = fitFrame({ x: -100, y: 50, width: 400, height: 200 }, MAP, 8);

  it("places the bounds corner at the offset", () => {
    const corner = toMap({ x: -100, y: 50, width: 400, height: 200 }, frame);
    expect(corner.x).toBeCloseTo(frame.offset.x);
    expect(corner.y).toBeCloseTo(frame.offset.y);
    expect(corner.width).toBeCloseTo(400 * frame.scale);
  });

  it("round-trips a point", () => {
    const board = { x: 37, y: 121 };
    const mapped = toMap({ ...board, width: 0, height: 0 }, frame);
    const back = toBoard(mapped, frame);
    expect(back.x).toBeCloseTo(board.x);
    expect(back.y).toBeCloseTo(board.y);
  });
});

describe("grabOffset", () => {
  const view = { x: 40, y: 20, width: 60, height: 40 };

  it("keeps the grip inside the viewport rectangle", () => {
    expect(grabOffset({ x: 80, y: 30 }, view)).toEqual({ x: 10, y: -10 });
  });

  it("misses outside the viewport rectangle", () => {
    expect(grabOffset({ x: 5, y: 5 }, view)).toBeNull();
  });
});

describe("centeredOn", () => {
  it("puts the board point at the screen center", () => {
    const viewport = centeredOn({ x: 100, y: 50 }, 2, SCREEN);
    expect(viewport).toEqual({ x: 200, y: 200, zoom: 2 });
    const area = visibleArea(viewport, SCREEN);
    expect(area.x + area.width / 2).toBeCloseTo(100);
    expect(area.y + area.height / 2).toBeCloseTo(50);
  });
});

describe("viewportAt", () => {
  const items = [{ x: 0, y: 0, width: 2000, height: 1000 }];
  const start = { x: 0, y: 0, zoom: 1 };
  const frame = fitFrame(
    boardBounds(items, visibleArea(start, SCREEN)),
    MAP,
    8,
  );

  it("centers the view where the map was clicked", () => {
    const click = toMap({ x: 1500, y: 700, width: 0, height: 0 }, frame);
    const next = viewportAt(click, { x: 0, y: 0 }, frame, 1, SCREEN);
    const area = visibleArea(next, SCREEN);
    expect(area.x + area.width / 2).toBeCloseTo(1500);
    expect(area.y + area.height / 2).toBeCloseTo(700);
    expect(next.zoom).toBe(1);
  });

  it("pans by the dragged distance without jumping to the grip", () => {
    const view = toMap(visibleArea(start, SCREEN), frame);
    const press = { x: view.x + 5, y: view.y + 5 };
    const grab = grabOffset(press, view) ?? { x: 0, y: 0 };
    expect(grab.x).toBeCloseTo(5 - view.width / 2);
    const still = viewportAt(press, grab, frame, 1, SCREEN);
    expect(still.x).toBeCloseTo(start.x);
    expect(still.y).toBeCloseTo(start.y);
    const moved = viewportAt(
      { x: press.x + 10, y: press.y + 4 },
      grab,
      frame,
      1,
      SCREEN,
    );
    expect(moved.x).toBeCloseTo(-10 / frame.scale);
    expect(moved.y).toBeCloseTo(-4 / frame.scale);
  });

  it("keeps the zoom it was given", () => {
    const next = viewportAt(
      { x: 50, y: 50 },
      { x: 0, y: 0 },
      frame,
      0.5,
      SCREEN,
    );
    expect(next.zoom).toBe(0.5);
  });
});
