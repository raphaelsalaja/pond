#!/usr/bin/env node
/**
 * Checks out the xeet fork at the commit `xeet.json` pins, next to the repo
 * where `Cargo.toml` reads it.
 *
 *   node packages/render/scripts/fetch-xeet.mjs
 *
 * `POND_XEET_TOKEN` authenticates when the fork is private.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { readPin, XEET } from "./xeet.mjs";

const { repository, rev } = readPin();
const token = process.env.POND_XEET_TOKEN;
const auth = token
  ? [
      "-c",
      `http.extraheader=AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
    ]
  : [];
const git = (...args) =>
  execFileSync("git", [...auth, ...args], { cwd: XEET, stdio: "inherit" });

mkdirSync(XEET, { recursive: true });
if (!existsSync(join(XEET, ".git"))) git("init", "--quiet");
try {
  git(
    "fetch",
    "--quiet",
    "--depth",
    "1",
    `https://github.com/${repository}.git`,
    rev,
  );
} catch {
  console.error(
    `[pond render] could not fetch ${repository}@${rev}. Publish that commit, or set POND_XEET_TOKEN if the fork is private.`,
  );
  process.exit(1);
}
git("checkout", "--quiet", "--force", "--detach", rev);
console.log(`xeet ${repository}@${rev} in ${XEET}`);
