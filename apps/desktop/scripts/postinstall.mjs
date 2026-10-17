#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const SETUP_STEPS = Object.freeze([
  {
    name: "Electron binary",
    script: "ensure-electron.mjs",
    required: true,
  },
  {
    name: "Electron native module rebuild",
    script: "rebuild-native.mjs",
    required: true,
  },
  {
    name: "application icon preparation",
    script: "prepare-app-icon.mjs",
    required: false,
  },
  {
    name: "icon preview preparation",
    script: "prepare-icon-previews.mjs",
    required: false,
  },
  {
    name: "development Electron branding",
    script: "patch-electron-name.mjs",
    required: false,
  },
  {
    name: "replay viewer assets",
    script: "copy-replay-assets.mjs",
    required: true,
  },
  {
    name: "browser native host",
    script: "build-native-host.mjs",
    // Compiling the Windows host needs MSVC. `dist:win` runs the same script
    // and fails there, so install only warns.
    required: process.platform !== "win32",
  },
]);

function runScript(step) {
  const result = spawnSync(
    process.execPath,
    [resolve(appRoot, "scripts", step.script)],
    {
      cwd: appRoot,
      stdio: "inherit",
    },
  );
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${step.script} exited with status ${result.status ?? "unknown"}`,
    );
  }
}

export function runSetup({
  steps = SETUP_STEPS,
  run = runScript,
  warn = console.warn,
} = {}) {
  for (const step of steps) {
    try {
      run(step);
    } catch (error) {
      if (step.required) {
        throw new Error(`[pond] required setup failed: ${step.name}`, {
          cause: error,
        });
      }
      warn(`[pond] optional setup skipped: ${step.name}: ${error.message}`);
    }
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === invokedPath) {
  try {
    runSetup();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
