import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const PACKAGE = resolve(import.meta.dirname, "..");
const REPO = resolve(PACKAGE, "../..");

/** `Cargo.toml` reads xeet-core from here, so the checkout must live here too. */
export const XEET = resolve(process.env.POND_XEET_DIR ?? join(REPO, "../xeet"));

/** The fork and commit release builds compile against. */
export function readPin() {
  const pin = JSON.parse(readFileSync(join(PACKAGE, "xeet.json"), "utf8"));
  const repository = String(pin.repository ?? "");
  const rev = String(pin.rev ?? "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(repository) || !/^[0-9a-f]{40}$/.test(rev)) {
    throw new Error(
      "packages/render/xeet.json needs an owner/name repository and a full commit rev.",
    );
  }
  return { repository, rev };
}

/** The commit checked out at `XEET`, or null when it is not a git checkout. */
export function checkedOutRev() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: XEET,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}
