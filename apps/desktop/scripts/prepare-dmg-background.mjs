#!/usr/bin/env node

/**
 * Rasterize the DMG background at 72 DPI so Finder window size equals pixel size.
 */

import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import sharp from "sharp";

const __dirname = import.meta.dirname;
const width = 720;
const height = 440;
const outDir = resolve(__dirname, "../packaging/dmg");
const outPng = join(outDir, "background.png");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="#F2F2F2"/>
</svg>`;

await mkdir(outDir, { recursive: true });
await sharp(Buffer.from(svg)).png().toFile(outPng);
console.log(`[pond] wrote ${outPng} (${width}x${height})`);
