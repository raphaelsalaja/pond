#!/usr/bin/env node

/**
 * Runs a script under Electron's Node runtime so native modules built for the
 * Electron ABI load. A wrapper because `VAR=1 command` is not portable to cmd.exe.
 */

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export function electronNodeInvocation(electronPath, args, env = process.env) {
  return {
    command: electronPath,
    args,
    env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
  };
}

const invokedPath = process.argv[1];
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
  const electronPath = createRequire(import.meta.url)("electron");
  const { command, args, env } = electronNodeInvocation(
    electronPath,
    process.argv.slice(2),
  );
  const result = spawnSync(command, args, { env, stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
