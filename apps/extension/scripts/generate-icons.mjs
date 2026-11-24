#!/usr/bin/env node

/**
 * Rasterize `packages/icons/brand/icon.svg` into Chrome action PNGs.
 * @see packages/icons/brand/icon.svg
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import sharp from "sharp";

const here = import.meta.dirname;
const outDir = join(here, "..", "public", "icons");
const svgPath = resolve(here, "../../../packages/icons/brand/icon.svg");

mkdirSync(outDir, { recursive: true });

function templateSvg(size) {
  const source = readFileSync(svgPath, "utf8");
  return source
    .replace(/\swidth="[^"]+"/, ` width="${size}"`)
    .replace(/\sheight="[^"]+"/, ` height="${size}"`)
    .replace(/fill="#[^"]+"/, 'fill="#000000"');
}

async function write(size) {
  const png = await sharp(Buffer.from(templateSvg(size)))
    .resize(size, size)
    .ensureAlpha()
    .png()
    .toBuffer();
  const out = join(outDir, `${size}.png`);
  writeFileSync(out, png);
  console.log(`wrote ${out} (${size}×${size}, ${png.length} bytes)`);
}

for (const size of [16, 32, 48, 128]) {
  await write(size);
}
