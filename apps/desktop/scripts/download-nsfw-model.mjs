#!/usr/bin/env node

import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(__dirname, "..");
const modelDir = resolve(appRoot, "resources/nsfw-model");

const SOURCE_BASE =
  "https://raw.githubusercontent.com/infinitered/nsfwjs/master/models/mobilenet_v2_mid";

const FILES = ["model.json", "group1-shard1of2", "group1-shard2of2"];

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function modelAlreadyInstalled() {
  for (const name of FILES) {
    const target = resolve(modelDir, name);
    if (!(await fileExists(target))) return false;
  }
  return true;
}

async function downloadFile(name) {
  const url = `${SOURCE_BASE}/${name}`;
  console.log(`[pond nsfw-model] fetching ${url}`);
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
  if (process.env.POND_SKIP_NSFW_MODEL === "1") {
    console.log("[pond nsfw-model] POND_SKIP_NSFW_MODEL=1; skipping download");
    return;
  }
  if (await modelAlreadyInstalled()) {
    console.log(
      `[pond nsfw-model] already installed at ${modelDir} (skipping)`,
    );
    return;
  }

  await mkdir(modelDir, { recursive: true });
  for (const name of FILES) {
    const target = resolve(modelDir, name);
    let buf;
    try {
      buf = await downloadFile(name);
    } catch (err) {
      console.warn(
        `[pond nsfw-model] download failed: ${
          err?.message ? err.message : err
        }.\n` +
          "  Pond will continue; the classifier will fall back to nsfwjs's\n" +
          "  default URL at runtime (requires network on first scan).",
      );
      return;
    }
    const tmp = `${target}.tmp`;
    await writeFile(tmp, buf);
    await rm(target, { force: true });
    await rename(tmp, target);
    console.log(
      `[pond nsfw-model] installed ${name} -> ${target} (${buf.byteLength} bytes)`,
    );
  }

  try {
    const json = JSON.parse(
      await readFile(resolve(modelDir, "model.json"), "utf-8"),
    );
    const referenced = (json.weightsManifest ?? []).flatMap(
      (m) => m.paths ?? [],
    );
    for (const p of referenced) {
      if (!(await fileExists(resolve(modelDir, p)))) {
        console.warn(
          `[pond nsfw-model] shard ${p} referenced by model.json is missing.\n` +
            "  Update FILES in scripts/download-nsfw-model.mjs.",
        );
        return;
      }
    }
  } catch (err) {
    console.warn(
      "[pond nsfw-model] couldn't validate model.json:",
      err?.message ?? err,
    );
  }
}

main().catch((err) => {
  console.warn(
    "[pond nsfw-model] unexpected error during postinstall:",
    err?.stack ? err.stack : err,
  );
  process.exit(0);
});
