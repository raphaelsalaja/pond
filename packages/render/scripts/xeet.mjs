import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const PACKAGE = resolve(import.meta.dirname, "..");
const REPO = resolve(PACKAGE, "../..");

/** `Cargo.toml` reads xeet-core from here, so the checkout must live here too. */
export const XEET = resolve(process.env.POND_XEET_DIR ?? join(REPO, "../xeet"));

const SHA = /^[0-9a-f]{40}$/;

/** Upstream xeet's commit, Pond's patches on top, and the tree they produce. */
export function readPin() {
  const pin = JSON.parse(readFileSync(join(PACKAGE, "xeet.json"), "utf8"));
  const repository = String(pin.repository ?? "");
  const rev = String(pin.rev ?? "");
  const tree = String(pin.tree ?? "");
  const patches = Array.isArray(pin.patches) ? pin.patches.map(String) : [];
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(repository) ||
    !SHA.test(rev) ||
    !SHA.test(tree)
  ) {
    throw new Error(
      "packages/render/xeet.json needs an owner/name repository, a full commit rev, and the patched tree.",
    );
  }
  return { repository, rev, patches, tree };
}

/** Output of a git command in the checkout, or null when it fails. */
export function gitOutput(...args) {
  try {
    return execFileSync("git", args, {
      cwd: XEET,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}
