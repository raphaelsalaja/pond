#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const binDir = resolve(appRoot, "resources/bin");

const RELEASE = {
  tag: "2026.03.17",
  assets: {
    darwin: {
      asset: "yt-dlp_macos",
      sha256:
        "e80c47b3ce712acee51d5e3d4eace2d181b44d38f1942c3a32e3c7ff53cd9ed5",
      filename: "yt-dlp",
    },
    linux: {
      asset: "yt-dlp_linux",
      sha256:
        "c2b0189f581fe4a2ddd41954f1bcb7d327db04b07ed0dea97e4f1b3e09b5dd8e",
      filename: "yt-dlp",
    },
    win32: {
      asset: "yt-dlp.exe",
      sha256:
        "3db811b366b2da47337d2fcfdfe5bbd9a258dad3f350c54974f005df115a1545",
      filename: "yt-dlp.exe",
    },
  },
};

function pickAsset() {
  const platform = process.platform;
  const asset = RELEASE.assets[platform];
  if (!asset) {
    console.warn(
      `[pond yt-dlp] no bundled binary for platform ${platform}; ` +
        `video downloads will fall back to a system-installed yt-dlp on PATH`,
    );
    return null;
  }
  return asset;
}

function downloadUrl(assetName) {
  return `https://github.com/yt-dlp/yt-dlp/releases/download/${RELEASE.tag}/${assetName}`;
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function alreadyInstalled(targetPath, expectedSha) {
  if (!(await fileExists(targetPath))) return false;
  const buf = await readFile(targetPath);
  const sha = createHash("sha256").update(buf).digest("hex");
  return sha === expectedSha;
}

async function downloadBinary(url) {
  console.log(`[pond yt-dlp] fetching ${url}`);
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "pond-postinstall" },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  if (process.env.POND_SKIP_YTDLP === "1") {
    console.log("[pond yt-dlp] POND_SKIP_YTDLP=1; skipping download");
    return;
  }

  const asset = pickAsset();
  if (!asset) return;

  await mkdir(binDir, { recursive: true });
  const target = resolve(binDir, asset.filename);

  if (await alreadyInstalled(target, asset.sha256)) {
    console.log(`[pond yt-dlp] already installed at ${target} (sha matches)`);
    return;
  }

  let buf;
  try {
    buf = await downloadBinary(downloadUrl(asset.asset));
  } catch (err) {
    console.warn(
      `[pond yt-dlp] download failed: ${err?.message ? err.message : err}.\n` +
        "  Pond will continue; in-app video downloads will be unavailable until\n" +
        "  the next successful postinstall (or a system-installed yt-dlp on PATH).",
    );
    return;
  }

  const sha = createHash("sha256").update(buf).digest("hex");
  if (sha !== asset.sha256) {
    console.warn(
      `[pond yt-dlp] sha256 mismatch for ${asset.asset}\n` +
        `  expected ${asset.sha256}\n` +
        `  got      ${sha}\n` +
        "  refusing to install. Update RELEASE in scripts/download-yt-dlp.mjs.",
    );
    return;
  }

  const tmp = `${target}.tmp`;
  await writeFile(tmp, buf);
  if (process.platform !== "win32") await chmod(tmp, 0o755);
  await rm(target, { force: true });
  await rename(tmp, target);
  console.log(
    `[pond yt-dlp] installed ${asset.asset} -> ${target} (${buf.byteLength} bytes)`,
  );
}

main().catch((err) => {
  console.warn(
    "[pond yt-dlp] unexpected error during postinstall:",
    err?.stack ? err.stack : err,
  );
  // Never fail the install; yt-dlp is a soft dependency.
  process.exit(0);
});
