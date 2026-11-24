#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { rebuild } from "@electron/rebuild";

const __dirname = import.meta.dirname;
const appRoot = resolve(__dirname, "..");

async function electronVersion() {
  const pkg = JSON.parse(
    await readFile(
      resolve(appRoot, "node_modules/electron/package.json"),
      "utf8",
    ),
  );
  return pkg.version;
}

async function main() {
  const version = await electronVersion();
  console.log(`[pond] rebuilding native modules for electron ${version}`);

  await rebuild({
    buildPath: appRoot,
    electronVersion: version,
    onlyModules: ["better-sqlite3-multiple-ciphers"],
    force: true,
  });

  console.log("[pond] native rebuild ok");
}

function fail(error) {
  console.error("[pond] native rebuild failed:", error);
  process.exit(1);
}

main().catch(fail);
