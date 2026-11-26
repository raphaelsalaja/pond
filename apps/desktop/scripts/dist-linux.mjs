#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";

/** Packages for the host arch only, because native modules rebuild against the build host's toolchain. */
const appRoot = resolve(import.meta.dirname, "..");
const publish = process.argv.includes("--publish");
const arch =
  process.arch === "arm64" ? "arm64" : process.arch === "x64" ? "x64" : null;
if (!arch) {
  console.error(
    `[pond] cannot package Pond for the host architecture ${process.arch}; use x64 or arm64 Linux`,
  );
  process.exit(1);
}

await fetchFfprobe(arch);

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

/** ffprobe-static ships no linux/arm64, so both arches take ffprobe from the ffmpeg-static release that ffmpeg comes from. */
async function fetchFfprobe(arch) {
  const config = createRequire(import.meta.url)("ffmpeg-static/package.json")[
    "ffmpeg-static"
  ];
  const release =
    process.env[config["binary-release-tag-env-var"]] ||
    config["binary-release-tag"];
  const dir = resolve(appRoot, "vendor/ffmpeg", `linux-${arch}`);
  const binary = join(dir, "ffprobe");
  const marker = join(dir, "ffprobe-release");
  if (
    existsSync(binary) &&
    existsSync(marker) &&
    readFileSync(marker, "utf8").trim() === release
  ) {
    return;
  }

  const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${release}/ffprobe-linux-${arch}.gz`;
  const response = await fetch(url);
  if (!response.ok) {
    console.error(
      `[pond] ffprobe fetch failed: ${url} answered ${response.status}`,
    );
    process.exit(1);
  }
  mkdirSync(dir, { recursive: true });
  writeFileSync(binary, gunzipSync(Buffer.from(await response.arrayBuffer())));
  chmodSync(binary, 0o755);
  writeFileSync(marker, release);
  console.log(`[pond] ffprobe ${release} linux-${arch} ok`);
}
