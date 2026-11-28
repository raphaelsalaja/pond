#!/usr/bin/env node
/**
 * Builds the post renderer WebAssembly and copies it, with the open-licensed
 * fonts it draws with, into `apps/desktop/resources/render/`.
 *
 *   node packages/render/scripts/build.mjs [--fast] [--required]
 *
 * `POND_XEET_DIR` points at the xeet checkout (default: a sibling of the repo).
 * `--required` (or `POND_RENDER_REQUIRED`) fails instead of skipping, and needs
 * the checkout to be upstream xeet at the commit `xeet.json` pins with
 * `patches/xeet/` applied. Release builds use it.
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
import { gitOutput, readPin, XEET } from "./xeet.mjs";

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
  /** Upstream plus Pond's patches has one tree, whether fetch applied them or a local branch carries them. */
  const { repository, rev, tree } = readPin();
  const fetch = "Run `node packages/render/scripts/fetch-xeet.mjs`.";
  const head = gitOutput("rev-parse", "HEAD^{tree}");
  if (head !== tree) {
    fail(
      `xeet at ${XEET} has tree ${head ?? "none (not a git checkout)"}, but xeet.json pins ${tree}: ${repository}@${rev.slice(0, 7)} with patches/xeet applied. ${fetch}`,
    );
  }
  if (gitOutput("status", "--porcelain", "--untracked-files=no")) {
    fail(`xeet at ${XEET} has uncommitted changes. ${fetch}`);
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
