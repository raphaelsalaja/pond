#!/usr/bin/env node
/** Exports each tint's `icon.icon` for the macOS icon styles beside its `default.png`. Needs Icon Composer's `ictool`; run it after editing a tint's artwork. */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const tintsRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../packages/icons/brand/tints",
);
const ictool = "/Applications/Icon Composer.app/Contents/Executables/ictool";

/**
 * Icon Composer design generations with their own `macos-NN/` export set. The
 * root keeps macOS 26: the tint's original `default.png` plus `dark.png`.
 * When Icon Composer adds a generation, append it here and rerun.
 */
const DESIGN_GENERATIONS = ["27"];

const EXPORTS = [
  { generation: "26", rendition: "Dark", file: "dark.png" },
  ...DESIGN_GENERATIONS.flatMap((generation) => [
    {
      generation,
      rendition: "Default",
      file: `macos-${generation}/default.png`,
    },
    { generation, rendition: "Dark", file: `macos-${generation}/dark.png` },
  ]),
];

if (!existsSync(ictool)) {
  console.error(`[icons] ${ictool} not found; install Icon Composer`);
  process.exit(1);
}

const work = mkdtempSync(join(tmpdir(), "pond-tint-icons-"));
for (const entry of readdirSync(tintsRoot, { withFileTypes: true })) {
  const source = join(tintsRoot, entry.name, "icon.icon");
  if (!entry.isDirectory() || !existsSync(source)) continue;
  for (const { generation, rendition, file } of EXPORTS) {
    const exported = join(work, `${entry.name}-${generation}-${rendition}.png`);
    const result = spawnSync(
      ictool,
      [
        source,
        "--export-image",
        "--output-file",
        exported,
        "--platform",
        "macOS",
        "--rendition",
        rendition,
        "--width",
        "1024",
        "--height",
        "1024",
        "--scale",
        "1",
        "--design-generation",
        generation,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    if (result.status !== 0) {
      console.error(`[icons] ictool failed for ${entry.name} ${file}`);
      process.exit(1);
    }
    const out = join(tintsRoot, entry.name, file);
    mkdirSync(dirname(out), { recursive: true });
    // ictool writes 16-bit PNGs; 8 bits per channel looks the same at Dock sizes and halves the file.
    await sharp(exported)
      .toColourspace("srgb")
      .png({ compressionLevel: 9, palette: false })
      .toFile(out);
    console.log(`[icons] wrote ${entry.name}/${file}`);
  }
}
rmSync(work, { recursive: true, force: true });
