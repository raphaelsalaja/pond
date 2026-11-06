#!/usr/bin/env node
/** Builds the Dock tile plug-in into resources/DockTile; the Dock loads it to draw the selected app icon color while Pond is not running. */

import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "dock-tile/main.swift");
const plugin = resolve(root, "resources/DockTile/PondDockTile.docktileplugin");
const binary = join(plugin, "Contents/MacOS/PondDockTile");

function skip(reason) {
  console.log(`[pond dock-tile] skipped: ${reason}`);
  process.exit(0);
}

function fail(message) {
  console.error(`[pond dock-tile] ${message}`);
  process.exit(1);
}

if (process.platform !== "darwin") skip("Dock tiles are macOS only");
const sdk = spawnSync("xcrun", ["--show-sdk-path"], { encoding: "utf8" });
if (sdk.status !== 0) {
  if (process.env.CI) fail("the macOS SDK is required");
  skip("the macOS SDK is not installed");
}

const work = mkdtempSync(join(tmpdir(), "pond-dock-tile-"));
try {
  const slices = ["arm64", "x86_64"].map((arch) => {
    const slice = join(work, arch);
    const result = spawnSync(
      "xcrun",
      [
        "swiftc",
        "-O",
        "-target",
        `${arch}-apple-macos13.5`,
        "-module-name",
        "PondDockTile",
        "-emit-library",
        "-Xlinker",
        "-bundle",
        source,
        "-o",
        slice,
      ],
      { stdio: "inherit" },
    );
    if (result.status !== 0) fail(`swiftc failed for ${arch}`);
    return slice;
  });
  rmSync(plugin, { recursive: true, force: true });
  mkdirSync(dirname(binary), { recursive: true });
  copyFileSync(
    resolve(root, "dock-tile/Info.plist"),
    join(plugin, "Contents/Info.plist"),
  );
  const lipo = spawnSync("lipo", ["-create", ...slices, "-output", binary], {
    stdio: "inherit",
  });
  if (lipo.status !== 0) fail("lipo failed");
  console.log(`[pond dock-tile] built ${plugin}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
