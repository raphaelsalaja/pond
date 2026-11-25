import { describe, expect, it } from "vitest";
import { createMinimap } from "./minimap";

function memoryStorage() {
  const memory = new Map<string, string>();
  return {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, value);
    },
  };
}

describe("canvas minimap preference", () => {
  it("shows the minimap until it is hidden", () => {
    const storage = memoryStorage();
    const minimap = createMinimap(() => storage);
    expect(minimap.shown()).toBe(true);
    minimap.toggle();
    expect(minimap.shown()).toBe(false);
    expect(storage.getItem("pond.canvasMinimap")).toBe("0");
  });

  it("remembers a hidden minimap across launches", () => {
    const storage = memoryStorage();
    storage.setItem("pond.canvasMinimap", "0");
    const minimap = createMinimap(() => storage);
    expect(minimap.shown()).toBe(false);
    minimap.toggle();
    expect(minimap.shown()).toBe(true);
    expect(storage.getItem("pond.canvasMinimap")).toBe("1");
  });
});
