#!/usr/bin/env node

/** Electron 42+ skips install.js under pnpm, and electron-vite needs path.txt before dev or build. */

import { createRequire } from "node:module";
import { resolve } from "node:path";

const __dirname = import.meta.dirname;
const appRoot = resolve(__dirname, "..");
const require = createRequire(resolve(appRoot, "package.json"));

async function main() {
  const electronPath = require("electron");
  console.log(`[pond] electron binary ok (${electronPath})`);
}

function fail(error) {
  console.error("[pond] electron binary install failed:", error);
  process.exitCode = 1;
}

main().catch(fail);
