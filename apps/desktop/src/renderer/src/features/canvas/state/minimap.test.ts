import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("canvas minimap preference", () => {
  beforeEach(() => {
    vi.resetModules();
    const memory = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("shows the minimap until it is hidden", async () => {
    const { minimap } = await import("./minimap");
    expect(minimap.shown()).toBe(true);
    minimap.toggle();
    expect(minimap.shown()).toBe(false);
    expect(localStorage.getItem("pond.canvasMinimap")).toBe("0");
  });

  it("remembers a hidden minimap across launches", async () => {
    localStorage.setItem("pond.canvasMinimap", "0");
    const { minimap } = await import("./minimap");
    expect(minimap.shown()).toBe(false);
    minimap.toggle();
    expect(minimap.shown()).toBe(true);
    expect(localStorage.getItem("pond.canvasMinimap")).toBe("1");
  });
});
