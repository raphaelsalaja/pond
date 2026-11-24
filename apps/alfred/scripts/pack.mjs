/** Zips `workflow/` and the built scripts into `dist/Pond.alfredworkflow`. */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const stage = resolve(root, ".pack");
const out = resolve(root, "dist/Pond.alfredworkflow");

/** Alfred generates object UIDs and canvas layout, so the plist is exported from its editor, not written by hand. */
if (!existsSync(resolve(root, "workflow/info.plist"))) {
  console.error(
    "[pond alfred] workflow/info.plist is missing. Export it from Alfred; see README.md.",
  );
  process.exit(1);
}

rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
cpSync(resolve(root, "workflow"), stage, { recursive: true });
cpSync(resolve(root, "dist/search.global.js"), resolve(stage, "search.js"));
cpSync(resolve(root, "dist/save.global.js"), resolve(stage, "save.js"));
rmSync(out, { force: true });
execFileSync("zip", ["-qr", out, "."], { cwd: stage });
console.log(`[pond alfred] packed ${out}`);
