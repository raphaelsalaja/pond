#!/usr/bin/env node

/**
 * Bundling the 1024px tints instead costs the renderer ~18 MB and ~50 MB of decoded bitmaps for a 44px grid.
 */

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const tintsRoot = resolve(__dirname, "../../../packages/icons/brand/tints");
const outDir = resolve(
  __dirname,
  "../src/renderer/src/generated/app-icon-previews",
);

const PREVIEW_SIZE = 128;

async function sourceFor(dir, file) {
  const path = join(dir, file);
  try {
    return { path, mtime: (await stat(path)).mtimeMs };
  } catch {
    return null;
  }
}

async function isFresh(out, sourceMtime) {
  try {
    return (await stat(out)).mtimeMs >= sourceMtime;
  } catch {
    return false;
  }
}

async function main() {
  let entries;
  try {
    entries = await readdir(tintsRoot, { withFileTypes: true });
  } catch {
    console.warn(
      "[pond] skip icon previews: packages/icons/brand/tints missing",
    );
    return;
  }

  await mkdir(outDir, { recursive: true });
  let written = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    // `<id>[.NN][.dark].png`: the root (macOS 26) or `macos-NN/` design, Default or Dark style.
    const tintDir = join(tintsRoot, entry.name);
    const generations = (await readdir(tintDir)).flatMap((name) => {
      const match = name.match(/^macos-(\d+)$/);
      return match ? [match[1]] : [];
    });
    const variants = [
      ["default.png", ""],
      ["dark.png", ".dark"],
      ...generations.flatMap((generation) => [
        [`macos-${generation}/default.png`, `.${generation}`],
        [`macos-${generation}/dark.png`, `.${generation}.dark`],
      ]),
    ];
    for (const [file, suffix] of variants) {
      const source = await sourceFor(join(tintsRoot, entry.name), file);
      if (!source) continue;
      const out = join(outDir, `${entry.name}${suffix}.png`);
      if (await isFresh(out, source.mtime)) continue;
      const png = await sharp(await readFile(source.path))
        .resize(PREVIEW_SIZE, PREVIEW_SIZE)
        .png({ compressionLevel: 9 })
        .toBuffer();
      await writeFile(out, png);
      written += 1;
    }
  }

  console.log(
    `[pond] icon previews ready (${written} written, ${PREVIEW_SIZE}px)`,
  );
}

await main();
