#!/usr/bin/env node
/** Compiles `pond-haptics` into resources/bin; it plays native trackpad haptics during sidebar drags. */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "haptics/main.swift");
const out = resolve(root, "resources/bin/pond-haptics");

function skip(reason) {
  console.log(`[pond haptics] skipped: ${reason}`);
  process.exit(0);
}

function fail(message) {
  console.error(`[pond haptics] ${message}`);
  process.exit(1);
}

if (process.platform !== "darwin") skip("trackpad haptics are macOS only");
const sdk = spawnSync("xcrun", ["--show-sdk-path"], { encoding: "utf8" });
if (sdk.status !== 0) {
  if (process.env.CI) fail("the macOS SDK is required");
  skip("the macOS SDK is not installed");
}

const work = mkdtempSync(join(tmpdir(), "pond-haptics-"));
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
        source,
        "-o",
        slice,
      ],
      { stdio: "inherit" },
    );
    if (result.status !== 0) fail(`swiftc failed for ${arch}`);
    return slice;
  });
  mkdirSync(dirname(out), { recursive: true });
  const lipo = spawnSync("lipo", ["-create", ...slices, "-output", out], {
    stdio: "inherit",
  });
  if (lipo.status !== 0) fail("lipo failed");
  console.log(`[pond haptics] built ${out}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
