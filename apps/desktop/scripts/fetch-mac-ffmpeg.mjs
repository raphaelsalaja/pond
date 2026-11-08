#!/usr/bin/env node

/** Fetches ffmpeg for both Mac architectures; ffmpeg-static installs only the runner's. */

import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const config = createRequire(import.meta.url)("ffmpeg-static/package.json")[
  "ffmpeg-static"
];
const release =
  process.env[config["binary-release-tag-env-var"]] ||
  config["binary-release-tag"];
const ARCHS = [
  { arch: "arm64", slice: "arm64" },
  { arch: "x64", slice: "x86_64" },
];

if (process.platform !== "darwin") process.exit(0);

for (const { arch, slice } of ARCHS) {
  const dir = resolve(root, "vendor/ffmpeg", `darwin-${arch}`);
  const binary = join(dir, "ffmpeg");
  const marker = join(dir, "release");
  if (readText(marker) === release && hasSlice(binary, slice)) continue;

  const url = `https://github.com/eugeneware/ffmpeg-static/releases/download/${release}/ffmpeg-darwin-${arch}.gz`;
  const response = await fetch(url);
  if (!response.ok) fail(`${url} answered ${response.status}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(binary, gunzipSync(Buffer.from(await response.arrayBuffer())));
  chmodSync(binary, 0o755);
  if (!hasSlice(binary, slice)) fail(`${binary} has no ${slice} slice`);
  writeFileSync(marker, release);
  console.log(`[pond] ffmpeg ${release} darwin-${arch} ok`);
}

function readText(path) {
  return existsSync(path) ? readFileSync(path, "utf8").trim() : null;
}

function hasSlice(path, slice) {
  if (!existsSync(path)) return false;
  const result = spawnSync("lipo", ["-archs", path], { encoding: "utf8" });
  return (
    result.status === 0 && result.stdout.trim().split(/\s+/).includes(slice)
  );
}

function fail(message) {
  console.error(`[pond] ffmpeg fetch failed: ${message}`);
  process.exit(1);
}
