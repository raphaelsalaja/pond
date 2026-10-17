import { existsSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { trayIconNames } from "./tray-icon";

const resources = join(__dirname, "../../resources");

async function glyphBrightness(file: string): Promise<number> {
  const { data } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let max = 0;
  let opaque = 0;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) === 0) continue;
    opaque += 1;
    max = Math.max(max, data[i] ?? 0);
  }
  expect(opaque).toBeGreaterThan(0);
  return max;
}

describe("trayIconNames", () => {
  it("keeps the template glyph on macOS and Linux", () => {
    expect(trayIconNames("darwin", true)).toEqual([
      "trayTemplate.png",
      "tray.png",
    ]);
    expect(trayIconNames("linux", false)).toEqual([
      "trayTemplate.png",
      "tray.png",
    ]);
  });

  it("picks the light glyph for dark Windows themes and the dark glyph otherwise", () => {
    expect(trayIconNames("win32", true)).toEqual(["trayWinLight.png"]);
    expect(trayIconNames("win32", false)).toEqual(["trayWinDark.png"]);
  });
});

describe("Windows tray assets", () => {
  it("ships every DPI step with a visible, correctly coloured glyph", async () => {
    for (const [suffix, size] of [
      ["", 16],
      ["@1.25x", 20],
      ["@1.5x", 24],
      ["@2x", 32],
    ] as const) {
      const light = join(resources, `trayWinLight${suffix}.png`);
      const dark = join(resources, `trayWinDark${suffix}.png`);
      expect(existsSync(light)).toBe(true);
      expect(existsSync(dark)).toBe(true);
      expect((await sharp(light).metadata()).width).toBe(size);
      expect(await glyphBrightness(light)).toBe(255);
      expect(await glyphBrightness(dark)).toBe(0);
    }
  });
});
