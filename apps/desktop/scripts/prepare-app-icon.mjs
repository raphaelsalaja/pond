#!/usr/bin/env node

/**
 * Keeps the squircle alpha and insets the art because `dock.setIcon` renders opaque full-bleed PNGs as huge squares.
 */

import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const buildDir = resolve(__dirname, "../build");
const sourcePng = resolve(
  __dirname,
  "../../../packages/icons/brand/tints/aqua/default.png",
);
const outPng = join(buildDir, "icon.png");
const outIcns = join(buildDir, "icon.icns");
const iconComposerSource = resolve(
  __dirname,
  "../../../packages/icons/brand/tints/aqua/icon.icon",
);
const outAssetCatalog = join(buildDir, "Assets.car");

/** Icon footprint inside the canvas. Native Dock tiles sit below ~1.0. */
const CONTENT_SCALE = 0.8;

async function main() {
  let meta;
  try {
    meta = await sharp(sourcePng).metadata();
  } catch (err) {
    if (err?.code === "ENOENT") {
      console.warn(
        "[pond] skip prepare-app-icon: packages/icons/brand/tints/aqua/default.png missing",
      );
      return;
    }
    throw err;
  }

  await mkdir(buildDir, { recursive: true });

  const size = meta.width ?? 1024;
  const contentSize = Math.round(size * CONTENT_SCALE);
  const offset = Math.round((size - contentSize) / 2);

  const content = await sharp(sourcePng)
    .ensureAlpha()
    .resize(contentSize, contentSize)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: content, left: offset, top: offset }])
    .png()
    .toFile(outPng);

  console.log(
    `[pond] wrote build/icon.png (squircle preserved, scale ${CONTENT_SCALE})`,
  );

  if (process.platform === "darwin") {
    await writeIcns(outPng, outIcns);
    await writeAssetCatalog(iconComposerSource, outAssetCatalog);
  }
}

/**
 * macOS 26+ renders the Icon Composer catalog in the system icon style; older
 * macOS ignores it and keeps icon.icns. electron-builder can compile `.icon`
 * itself, but then derives an icns capped at 256 px for those older systems.
 */
async function writeAssetCatalog(source, catalogPath) {
  await rm(catalogPath, { force: true });
  const parent = await mkdtemp(join(tmpdir(), "pond-app-icon-catalog-"));
  try {
    const result = spawnSync(
      "xcrun",
      [
        "actool",
        source,
        "--compile",
        parent,
        "--app-icon",
        "icon",
        "--include-all-app-icons",
        "--platform",
        "macosx",
        "--target-device",
        "mac",
        "--minimum-deployment-target",
        "26.0",
        "--output-partial-info-plist",
        join(parent, "info.plist"),
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    if (result.status !== 0) {
      console.warn(
        "[pond] actool 26+ unavailable; packager will use icns only",
      );
      return;
    }
    await copyFile(join(parent, "Assets.car"), catalogPath);
    console.log("[pond] wrote build/Assets.car");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

async function writeIcns(pngPath, icnsPath) {
  const parent = await mkdtemp(join(tmpdir(), "pond-app-icon-"));
  const iconset = join(parent, "icon.iconset");
  try {
    await mkdir(iconset, { recursive: true });
    for (const size of [16, 32, 128, 256, 512]) {
      await sharp(pngPath)
        .resize(size, size)
        .png()
        .toFile(join(iconset, `icon_${size}x${size}.png`));
      await sharp(pngPath)
        .resize(size * 2, size * 2)
        .png()
        .toFile(join(iconset, `icon_${size}x${size}@2x.png`));
    }
    const result = spawnSync(
      "iconutil",
      ["-c", "icns", iconset, "-o", icnsPath],
      { stdio: "inherit" },
    );
    if (result.status !== 0) {
      console.warn("[pond] iconutil failed; packager will use PNG only");
      return;
    }
    console.log("[pond] wrote build/icon.icns");
  } finally {
    await rm(parent, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("[pond] prepare-app-icon failed:", err);
  process.exitCode = 1;
});
