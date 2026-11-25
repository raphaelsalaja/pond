import { describe, expect, it } from "vitest";
import { appIconSwatch, listAppIconPreviews } from "./app-icon-previews";

describe("app icon previews", () => {
  it("lists bundled tint images with aqua first", () => {
    const icons = listAppIconPreviews();
    expect(icons.length).toBeGreaterThan(0);
    expect(icons[0]?.id).toBe("aqua");
    expect(icons.every((icon) => Boolean(icon.base.light))).toBe(true);
    expect(icons.find((icon) => icon.id === "mocha")?.tint).toMatch(
      /^#[0-9a-f]{6}$/,
    );
    expect(icons.map((icon) => icon.id)).toEqual(
      expect.arrayContaining(["aqua", "mocha", "maraschino"]),
    );
  });

  it("picks the swatch the Dock shows for the macOS version and icon style", () => {
    const grape = listAppIconPreviews().find((icon) => icon.id === "grape");
    const macos27 = grape?.generations.get(27);
    if (!grape || !macos27) throw new Error("grape previews missing");
    const swatch = (
      style: "light" | "dark" | "monochrome" | null,
      macosMajor: number | null,
    ) => appIconSwatch(grape, { style, macosMajor });
    expect(swatch("light", 26)).toBe(grape.base.light);
    expect(swatch("dark", 26)).toBe(grape.base.dark);
    expect(swatch("light", 27)).toBe(macos27.light);
    expect(swatch("dark", 27)).toBe(macos27.dark);
    expect(swatch("dark", 30)).toBe(macos27.dark);
    expect(swatch("monochrome", 27)).toBe(macos27.light);
    expect(appIconSwatch(grape, undefined)).toBe(grape.base.light);
  });
});
