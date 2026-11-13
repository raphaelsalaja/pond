#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Packages for the host arch only, because native modules rebuild against the build host's toolchain. */
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
/** On Linux `${arch}` expands to x86_64/amd64, but electron-updater matches `process.arch` in file URLs. */
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
