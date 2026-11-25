import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  actualToSlider,
  FIT_POSE,
  sliderToActual,
  viewerMemory,
  viewerWheelIntent,
  wheelZoomFactor,
  zoomImageAt,
} from "./viewer-memory";

describe("viewer continuity", () => {
  beforeAll(() => localStorage.clear());
  afterAll(() => localStorage.clear());
  it("keeps the point under the pointer fixed when zooming", () => {
    const before = { zoom: 2, x: 40, y: -30 };
    const point = { x: 100, y: 80 };
    const after = zoomImageAt(before, 4, point);
    expect((point.x - after.x) / after.zoom).toBe(
      (point.x - before.x) / before.zoom,
    );
    expect((point.y - after.y) / after.zoom).toBe(
      (point.y - before.y) / before.zoom,
    );
    expect(zoomImageAt(FIT_POSE, 100, point).zoom).toBe(32);
  });
  it("retains independent image poses and playback positions", () => {
    viewerMemory.setImage("pond://memory-a/a.jpg", { zoom: 3, x: 10, y: 20 });
    viewerMemory.setPlayback("pond://memory-a/a.jpg", 42);
    viewerMemory.setLoop("pond://memory-a/a.jpg", [10, 20]);
    viewerMemory.setImage("pond://memory-b/b.jpg", { zoom: 2, x: 0, y: 0 });
    expect(viewerMemory.image("pond://memory-a/a.jpg")).toEqual({
      zoom: 3,
      x: 10,
      y: 20,
    });
    expect(viewerMemory.playback("pond://memory-a/a.jpg")).toBe(42);
    expect(viewerMemory.loop("pond://memory-a/a.jpg")).toEqual([10, 20]);
    viewerMemory.setLoop("pond://memory-a/a.jpg", null);
    expect(viewerMemory.loop("pond://memory-a/a.jpg")).toBeNull();
    expect(viewerMemory.image("missing")).toEqual(FIT_POSE);
    expect(window.localStorage.getItem("pond:viewer-memory")).toContain(
      "memory-a",
    );
  });
  it("bounds persistent viewing history", () => {
    for (let index = 0; index < 205; index += 1) {
      viewerMemory.setPlayback(`bounded-${index}`, index);
    }
    expect(viewerMemory.playback("bounded-1")).toBe(0);
    expect(viewerMemory.playback("bounded-204")).toBe(204);
    expect(
      JSON.parse(window.localStorage.getItem("pond:viewer-memory") ?? "[]"),
    ).toHaveLength(200);
  });

  it("stores a single-frame GIF loop at frame zero", () => {
    viewerMemory.setLoop("pond://gif/loop.gif", [0, 0]);
    expect(viewerMemory.loop("pond://gif/loop.gif")).toEqual([0, 0]);
  });
});

describe("viewer wheel intent", () => {
  it("treats pinch and modifier scroll as zoom regardless of the scrolling pref", () => {
    expect(
      viewerWheelIntent({
        ctrlKey: true,
        altKey: false,
        metaKey: false,
        wheelBehavior: "scroll",
      }),
    ).toBe("zoom");
    expect(
      viewerWheelIntent({
        ctrlKey: true,
        altKey: false,
        metaKey: false,
        wheelBehavior: "navigate",
      }),
    ).toBe("zoom");
    expect(
      viewerWheelIntent({
        ctrlKey: false,
        altKey: true,
        metaKey: false,
        wheelBehavior: "scroll",
      }),
    ).toBe("zoom");
    expect(
      viewerWheelIntent({
        ctrlKey: false,
        altKey: false,
        metaKey: true,
        wheelBehavior: "navigate",
      }),
    ).toBe("zoom");
  });

  it("follows Image Scrolling when the wheel is a two-finger drag", () => {
    expect(
      viewerWheelIntent({
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        wheelBehavior: "scroll",
      }),
    ).toBe("pan");
    expect(
      viewerWheelIntent({
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        wheelBehavior: "zoom",
      }),
    ).toBe("zoom");
    expect(
      viewerWheelIntent({
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        wheelBehavior: "navigate",
      }),
    ).toBe("navigate");
  });
});

describe("wheel zoom factor", () => {
  it("zooms in for a negative pinch delta", () => {
    expect(wheelZoomFactor(-10, 0, true)).toBeGreaterThan(1);
    expect(wheelZoomFactor(10, 0, true)).toBeLessThan(1);
  });

  it("applies a stronger gain to pinch than to mouse-wheel pixels", () => {
    const pinch = wheelZoomFactor(-10, 0, true);
    const wheel = wheelZoomFactor(-10, 0, false);
    expect(pinch).toBeGreaterThan(wheel);
    expect(wheel).toBeGreaterThan(1);
  });

  it("keeps applied zoom inside the pose clamp", () => {
    const factor = wheelZoomFactor(-10_000, 0, true);
    expect(Number.isFinite(factor)).toBe(true);
    expect(
      zoomImageAt(FIT_POSE, FIT_POSE.zoom * factor, { x: 0, y: 0 }).zoom,
    ).toBe(32);
    expect(
      zoomImageAt(FIT_POSE, FIT_POSE.zoom * wheelZoomFactor(10_000, 0, true), {
        x: 0,
        y: 0,
      }).zoom,
    ).toBe(0.05);
  });
});

describe("zoom slider", () => {
  it("places actual size at the midpoint", () => {
    expect(sliderToActual(50)).toBeCloseTo(1);
    expect(actualToSlider(1)).toBeCloseTo(50);
  });

  it("maps the ends to 5% and 800%", () => {
    expect(sliderToActual(0)).toBeCloseTo(0.05);
    expect(sliderToActual(100)).toBeCloseTo(8);
    expect(actualToSlider(0.05)).toBeCloseTo(0);
    expect(actualToSlider(8)).toBeCloseTo(100);
  });
});
