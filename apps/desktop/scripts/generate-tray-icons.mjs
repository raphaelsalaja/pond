#!/usr/bin/env node

/**
 * Windows tray icons are not template images, so the black macOS glyph vanishes
 * on a dark taskbar. Recolour the existing glyph's alpha into a light and a dark
 * variant at the DPI steps Windows asks for (16px base, 1.25x, 1.5x, 2x).
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const resources = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../resources",
);
const source = join(resources, "trayTemplate@2x.png");

const variants = [
  { name: "trayWinLight", color: { r: 255, g: 255, b: 255 } },
  { name: "trayWinDark", color: { r: 0, g: 0, b: 0 } },
];
const scales = [
  { suffix: "", size: 16 },
  { suffix: "@1.25x", size: 20 },
  { suffix: "@1.5x", size: 24 },
  { suffix: "@2x", size: 32 },
];

for (const { name, color } of variants) {
  for (const { suffix, size } of scales) {
    const alpha = await sharp(source)
      .resize(size, size, { kernel: "lanczos3" })
      .extractChannel("alpha")
      .raw()
      .toBuffer();
    await sharp({
      create: { width: size, height: size, channels: 3, background: color },
    })
      .joinChannel(alpha, { raw: { width: size, height: size, channels: 1 } })
      .png()
      .toFile(join(resources, `${name}${suffix}.png`));
  }
}
