#!/usr/bin/env node
/**
 * Builds the post renderer WebAssembly and copies it, with the open-licensed
 * fonts it draws with, into `apps/desktop/resources/render/`.
 *
 *   node packages/render/scripts/build.mjs [--fast] [--required]
 *
 * `POND_XEET_DIR` points at the xeet checkout (default: a sibling of the repo).
 * `--required` (or `POND_RENDER_REQUIRED`) fails instead of skipping, and needs
 * the checkout at the commit `xeet.json` pins. Release builds use it.
 */

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { checkedOutRev, readPin, XEET } from "./xeet.mjs";

const PACKAGE = resolve(import.meta.dirname, "..");
const REPO = resolve(PACKAGE, "../..");
const OUT = join(REPO, "apps/desktop/resources/render");
const TARGET = "wasm32-unknown-unknown";
const profile = process.argv.includes("--fast") ? "fast" : "release";
const required =
  process.argv.includes("--required") ||
  Boolean(process.env.POND_RENDER_REQUIRED);

function fail(message) {
  console.error(`[pond render] ${message}`);
  process.exit(1);
}

/** Without the WebAssembly the desktop app draws posts with the React card, so a missing fork skips unless required. */
if (!existsSync(join(XEET, "crates/xeet-core"))) {
  const message = `No xeet checkout at ${XEET}. Run \`node packages/render/scripts/fetch-xeet.mjs\` or set POND_XEET_DIR.`;
  if (required) fail(message);
  console.warn(`${message} Skipping the post renderer.`);
  process.exit(0);
}

if (required) {
  const { repository, rev } = readPin();
  const head = checkedOutRev();
  if (head !== rev) {
    fail(
      `xeet at ${XEET} is ${head ?? "not a git checkout"}, but xeet.json pins ${repository}@${rev}. Run \`node packages/render/scripts/fetch-xeet.mjs\`.`,
    );
  }
}

execFileSync(
  "cargo",
  ["build", "--profile", profile, "--target", TARGET, "-p", "pond-render"],
  {
    cwd: PACKAGE,
    stdio: "inherit",
    env: {
      ...process.env,
      XEET_FONT_PACKS: "chirp",
      XEET_EXTRA_FONTS: join(PACKAGE, "fonts.json"),
      XEET_EXTRA_ICONS: join(PACKAGE, "icons.json"),
    },
  },
);

mkdirSync(join(OUT, "fonts"), { recursive: true });
const wasm = join(PACKAGE, "target", TARGET, profile, "pond_render.wasm");
copyFileSync(wasm, join(OUT, "pond-render.wasm"));

/** SIL OFL fonts only: Inter for Bluesky, and xeet's Noto and STIX fallbacks. */
const open = [
  ...readdirSync(join(PACKAGE, "fonts/inter"))
    .filter((f) => f.endsWith(".otf") || f === "OFL.txt")
    .map((f) => join(PACKAGE, "fonts/inter", f)),
  ...readdirSync(join(XEET, "assets/vendor/fonts"))
    .filter((f) => /^(Noto|STIX)/.test(f))
    .map((f) => join(XEET, "assets/vendor/fonts", f)),
];
for (const file of open) {
  copyFileSync(file, join(OUT, "fonts", file.split("/").pop()));
}
const names = open.map((file) => file.split("/").pop());
for (const prefix of ["Inter", "Noto", "STIX"]) {
  if (!names.some((name) => name.startsWith(prefix))) {
    fail(`No ${prefix} fonts found for the post renderer.`);
  }
}

const mb = (statSync(join(OUT, "pond-render.wasm")).size / 1e6).toFixed(1);
console.log(`pond-render.wasm ${mb} MB and ${open.length} fonts in ${OUT}`);
