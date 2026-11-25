#!/usr/bin/env node
/** Compiles `pond-apple-model` into resources/bin; FoundationModels is weak-linked so Pond still launches before macOS 26. */

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "apple-model/main.swift");
const out = resolve(root, "resources/bin/pond-apple-model");

function skip(reason) {
  console.log(`[pond apple-model] skipped: ${reason}`);
  process.exit(0);
}

function fail(message) {
  console.error(`[pond apple-model] ${message}`);
  process.exit(1);
}

if (process.platform !== "darwin") skip("Apple Intelligence is macOS only");
const sdk = spawnSync("xcrun", ["--show-sdk-path"], { encoding: "utf8" });
if (sdk.status !== 0) {
  if (process.env.CI) fail("the macOS SDK is required");
  skip("the macOS SDK is not installed");
}

const work = mkdtempSync(join(tmpdir(), "pond-apple-model-"));
try {
  const slices = ["arm64", "x86_64"].map((arch) => {
    const slice = join(work, arch);
    const result = spawnSync(
      "xcrun",
      [
        "swiftc",
        "-O",
        "-parse-as-library",
        "-target",
        `${arch}-apple-macos13.5`,
        "-Xlinker",
        "-weak_framework",
        "-Xlinker",
        "FoundationModels",
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
  console.log(`[pond apple-model] built ${out}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
