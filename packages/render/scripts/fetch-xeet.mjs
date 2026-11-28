#!/usr/bin/env node
/**
 * Checks out upstream xeet at the commit `xeet.json` pins, applies Pond's
 * patches from `patches/xeet/` in order, and confirms the pinned tree. The
 * checkout sits next to the repo, where `Cargo.toml` reads it.
 *
 *   node packages/render/scripts/fetch-xeet.mjs
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { gitOutput, PACKAGE, readPin, XEET } from "./xeet.mjs";

const { repository, rev, patches, tree } = readPin();

function fail(message) {
  console.error(`[pond render] ${message}`);
  process.exit(1);
}

/** `git am` records a committer; a fixed one keeps CI runners from needing git config. */
const git = (...args) =>
  execFileSync(
    "git",
    ["-c", "user.name=Pond", "-c", "user.email=pond@localhost", ...args],
    { cwd: XEET, stdio: "inherit" },
  );

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
  fail(`could not fetch ${repository}@${rev}.`);
}
/** A patch that failed on an earlier run leaves `git am` mid-way. */
if (existsSync(join(XEET, ".git/rebase-apply"))) git("am", "--abort");
git("checkout", "--quiet", "--force", "--detach", rev);
git("clean", "--quiet", "-fdx");

for (const patch of patches) {
  try {
    git("am", "--quiet", join(PACKAGE, patch));
  } catch {
    fail(`${patch} does not apply to ${repository}@${rev}.`);
  }
}

const head = gitOutput("rev-parse", "HEAD^{tree}");
if (head !== tree) {
  fail(`patched xeet has tree ${head}, but xeet.json pins ${tree}.`);
}
console.log(
  `xeet ${repository}@${rev.slice(0, 7)} with ${patches.length} patches in ${XEET}`,
);
