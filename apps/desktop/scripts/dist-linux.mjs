#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Packages the Linux app for the host architecture (x64 or arm64).
 *
 * electron-builder rebuilds the native modules (better-sqlite3, sharp,
 * sqlite-vec, onnxruntime) against the build host's toolchain, so cross-arch
 * packaging would ship the wrong binaries. Run this on the architecture you
 * are packaging for; the dist:linux scripts use it instead of passing a
 * hardcoded `--x64`.
 */
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publish = process.argv.includes("--publish");
const arch =
  process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : null;
if (!arch) {
  console.error(
    `[pond] cannot package Pond for the host architecture ${process.arch}; use x64 or arm64 Linux`,
  );
  process.exit(1);
}

console.log(
  `[pond] packaging Linux ${arch} (publish: ${publish ? "always" : "never"})`,
);
// electron-builder's `${arch}` token expands to the packaging-convention name
// on Linux (x86_64/amd64), but electron-updater matches `process.arch`
// (x64/arm64) inside file URLs, so pass the host arch literally.
const artifactName =
  "--config.linux.artifactName=" +
  `\${productName}-\${version}-${arch}.\${ext}`;
const result = spawnSync(
  "electron-builder",
  [
    "--linux",
    `--${arch}`,
    artifactName,
    "--publish",
    publish ? "always" : "never",
  ],
  { cwd: appRoot, stdio: "inherit" },
);
process.exit(result.status ?? 1);
