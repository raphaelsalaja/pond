import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  markOverlay,
  renderLibraryFolderIcon,
  tintFolderPixels,
} from "./folder-icon-art";

const markSvg = readFileSync(
  join(__dirname, "../../../../../packages/icons/brand/icon.svg"),
  "utf8",
);

function hueOf(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  if (delta === 0) return 0;
  if (max === r) return (((g - b) / delta + 6) % 6) * 60;
  if (max === g) return ((b - r) / delta + 2) * 60;
  return ((r - g) / delta + 4) * 60;
}

async function systemFolder(): Promise<Buffer> {
  return sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 115, g: 207, b: 242, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

async function pixelAt(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const offset = (y * info.width + x) * info.channels;
  return {
    r: data[offset] ?? 0,
    g: data[offset + 1] ?? 0,
    b: data[offset + 2] ?? 0,
    a: data[offset + 3] ?? 0,
  };
}

describe("tintFolderPixels", () => {
  it("leaves transparent pixels alone", () => {
    const pixels = new Uint8Array(1024 * 1024 * 4);
    tintFolderPixels(pixels, 1024);
    expect(pixels.every((value) => value === 0)).toBe(true);
  });
});

describe("markOverlay", () => {
  it("refuses an SVG without a path", () => {
    expect(() => markOverlay('<svg viewBox="0 0 10 10"></svg>')).toThrow(
      "no path",
    );
  });
});

describe("renderLibraryFolderIcon", () => {
  it("turns the folder Pond blue with the white mark on top", async () => {
    const icon = await renderLibraryFolderIcon(await systemFolder(), markSvg);

    const face = await pixelAt(icon, 150, 850);
    expect(hueOf(face.r, face.g, face.b)).toBeCloseTo(209, 0);

    const lobe = await pixelAt(icon, 397, 459);
    expect(Math.min(lobe.r, lobe.g, lobe.b)).toBeGreaterThan(220);

    const hole = await pixelAt(icon, 512, 574);
    expect(hueOf(hole.r, hole.g, hole.b)).toBeCloseTo(209, 0);
  });
});
