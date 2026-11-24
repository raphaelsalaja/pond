#!/usr/bin/env node
/** Writes each tint's Dock-ready icons into build/dock-icons and its plain icon into build/app-icons, so Pond ships them at the size it shows them. */

import { mkdir, readdir, stat } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const tintsRoot = resolve(root, "../../packages/icons/brand/tints");
const outRoot = resolve(root, "build/dock-icons");
const appIconsRoot = resolve(root, "build/app-icons");

const CANVAS = 1024;
/** AppKit holds about 32 MB of decoded representations for a 1024 px Dock image and 8 MB at 512 px. */
const OUTPUT_PX = 512;
/** The Windows and Linux window icon and the 256 px library logo are the largest places a tint's own image shows. */
const APP_ICON_PX = 512;
/** The macOS app icon grid: the icon body spans 824 of 1024 points, as native icons render in the Dock. */
const CONTENT = 824;
/**
 * The drop shadow macOS draws under native app icons, which the Dock adds only
 * to icons it renders itself: a Gaussian blur (sigma) of the icon body, shifted
 * down, in black, in points of the 1024 grid.
 */
const SHADOW = { blur: 17, offsetY: 8, opacity: 0.25 };

/** `default.png`, `dark.png`, and the same pair in each `macos-NN/` folder. */
async function tintImages(dir) {
  const images = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isFile() && /^(default|dark)\.png$/.test(entry.name)) {
      images.push(join(dir, entry.name));
    } else if (entry.isDirectory() && /^macos-\d+$/.test(entry.name)) {
      images.push(...(await tintImages(join(dir, entry.name))));
    }
  }
  return images;
}

async function isFresh(out, source) {
  try {
    return (await stat(out)).mtimeMs >= (await stat(source)).mtimeMs;
  } catch {
    return false;
  }
}

function canvas() {
  return sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
}

/** The icon body on the macOS icon grid, without a shadow. */
async function placed(source) {
  const body = await sharp(source)
    .ensureAlpha()
    .resize(CONTENT, CONTENT)
    .png()
    .toBuffer();
  const offset = (CANVAS - CONTENT) / 2;
  return canvas()
    .composite([{ input: body, left: offset, top: offset }])
    .png()
    .toBuffer();
}

async function withShadow(icon) {
  // sharp applies `linear` before `blur` within one pipeline, so they run as two.
  const blurred = await sharp(icon)
    .extractChannel(3)
    .blur(SHADOW.blur)
    .toBuffer();
  const alpha = await sharp(blurred).linear(SHADOW.opacity, 0).toBuffer();
  const shadow = await sharp({
    create: {
      width: CANVAS,
      height: CANVAS,
      channels: 3,
      background: { r: 0, g: 0, b: 0 },
    },
  })
    .joinChannel(alpha)
    .png()
    .toBuffer();
  return canvas()
    .composite([
      { input: shadow, left: 0, top: SHADOW.offsetY },
      { input: icon, left: 0, top: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * The tint's own image as 8-bit sRGB; the source is a 16-bit Display P3 export.
 * @remarks `toColourspace` alone skips the embedded profile on 16-bit input and shifts the colors.
 */
async function writeAppIcon(tintDir, name) {
  const source = join(tintDir, "default.png");
  const out = join(appIconsRoot, name, "default.png");
  try {
    await stat(source);
  } catch {
    return false;
  }
  if (await isFresh(out, source)) {
    return false;
  }
  await mkdir(dirname(out), { recursive: true });
  await sharp(source)
    .resize(APP_ICON_PX, APP_ICON_PX)
    .withIccProfile("srgb")
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(out);
  return true;
}

async function main() {
  let tints;
  try {
    tints = await readdir(tintsRoot, { withFileTypes: true });
  } catch {
    console.warn("[pond] skip Dock icons: packages/icons/brand/tints missing");
    return;
  }
  let written = 0;
  let appIcons = 0;
  for (const tint of tints) {
    if (!tint.isDirectory()) {
      continue;
    }
    if (await writeAppIcon(join(tintsRoot, tint.name), tint.name)) {
      appIcons++;
    }
    for (const source of await tintImages(join(tintsRoot, tint.name))) {
      const out = join(outRoot, relative(tintsRoot, source));
      if (await isFresh(out, source)) {
        continue;
      }
      await mkdir(dirname(out), { recursive: true });
      const icon = await placed(source);
      // Windows and Linux show the icon in a window or taskbar, where a drawn shadow does not belong.
      await sharp(process.platform === "darwin" ? await withShadow(icon) : icon)
        .resize(OUTPUT_PX, OUTPUT_PX)
        // Adaptive filtering is lossless and roughly halves these smooth gradients.
        .png({ compressionLevel: 9, adaptiveFiltering: true })
        .toFile(out);
      written++;
    }
  }
  console.log(
    `[pond] Dock icons: ${written} written; app icons: ${appIcons} written`,
  );
}

await main();
