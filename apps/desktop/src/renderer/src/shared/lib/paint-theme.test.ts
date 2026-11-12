import { afterEach, describe, expect, it, vi } from "vitest";
import { paintTheme } from "./paint-theme";

const light = {
  background: "#ffffff",
  foreground: "#111111",
  accent: "#3b82f6",
};
const dark = {
  background: "#111111",
  foreground: "#f5f5f5",
  accent: "#3b82f6",
};

describe("paintTheme", () => {
  afterEach(() => vi.restoreAllMocks());

  it("skips repainting a theme that is already on the root", () => {
    expect(paintTheme(light, "srgb")).toBe("light");
    const setProperty = vi.spyOn(document.documentElement.style, "setProperty");
    expect(paintTheme({ ...light }, "srgb")).toBe("light");
    expect(setProperty).not.toHaveBeenCalled();
  });

  it("repaints when the theme or gamut changes", () => {
    paintTheme(light, "srgb");
    const setProperty = vi.spyOn(document.documentElement.style, "setProperty");
    expect(paintTheme(dark, "srgb")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    const darkWrites = setProperty.mock.calls.length;
    expect(darkWrites).toBeGreaterThan(0);
    paintTheme(dark, "p3");
    expect(setProperty.mock.calls.length).toBeGreaterThan(darkWrites);
    paintTheme({ ...dark, contrast: 80 }, "p3");
    expect(setProperty.mock.calls.length).toBeGreaterThan(darkWrites * 2);
  });
});
