#!/usr/bin/env node
/**
 * Builds the native core for this machine and copies it next to `index.cjs`.
 *
 *   node packages/core/scripts/build.mjs [--debug]
 */

import { execFileSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PACKAGE = resolve(import.meta.dirname, "..");
const debug = process.argv.includes("--debug");
const profile = debug ? "debug" : "release";

execFileSync("cargo", ["build", ...(debug ? [] : ["--release"])], {
  cwd: PACKAGE,
  stdio: "inherit",
});

const library = {
  darwin: "libpond_core.dylib",
  linux: "libpond_core.so",
  win32: "pond_core.dll",
}[process.platform];
if (!library) throw new Error(`Unsupported platform ${process.platform}`);

const out = join(PACKAGE, `pond-core.${process.platform}-${process.arch}.node`);
copyFileSync(join(PACKAGE, "target", profile, library), out);
console.log(`[pond core] wrote ${out}`);
