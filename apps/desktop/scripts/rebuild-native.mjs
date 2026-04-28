#!/usr/bin/env node

/**
 * Manual native rebuild for `better-sqlite3`, `keytar`, `sqlite-vec`.
 *
 * Run this whenever:
 *  - you bumped the `electron` version in package.json
 *  - `pnpm install` warned that `postinstall` skipped
 *  - a dev-time segfault smells like an ABI mismatch
 *
 * Under the hood: shells out to `@electron/rebuild` scoped to exactly the
 * packages with native bindings, picking up the current Electron version
 * from `node_modules/electron/package.json` so we don't need a hard-coded
 * version in two places.
 */

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
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

function run(cmd, args, opts) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`exit ${code}`)),
    );
    child.on("error", reject);
  });
}

async function main() {
  const version = await electronVersion();
  console.log(`[pond] rebuilding native modules for electron ${version}`);

  await run(
    "pnpm",
    [
      "exec",
      "electron-rebuild",
      "--version",
      version,
      "--only",
      "better-sqlite3,keytar",
      "--force",
    ],
    { cwd: appRoot },
  );

  console.log("[pond] native rebuild ok");
}

main().catch((err) => {
  console.error("[pond] native rebuild failed:", err);
  process.exit(1);
});
