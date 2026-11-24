import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

export const packageRoot = resolve(import.meta.dirname, "..");
export const repoRoot = resolve(packageRoot, "../..");

/** `ArrowRotate2` becomes `arrow-rotate-2`. */
export function fileName(glyph) {
  return glyph
    .replaceAll(/([a-z])([A-Z0-9])/g, "$1-$2")
    .replaceAll(/([0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

/** Generated files go through oxfmt so `--check` compares against what CI enforces. */
function format(path, source) {
  return execFileSync(
    process.execPath,
    [
      resolve(repoRoot, "node_modules/oxfmt/bin/oxfmt"),
      `--stdin-filepath=${relative(repoRoot, path)}`,
    ],
    { cwd: repoRoot, encoding: "utf8", input: source },
  );
}

/** Outputs marked `raw` skip oxfmt, which the repo config keeps off Markdown. */
export function emit(outputs, { check, command }) {
  const stale = [];
  for (const [path, source, raw] of outputs) {
    const formatted = raw ? source : format(path, source);
    const current = existsSync(path) ? readFileSync(path, "utf8") : null;
    if (current === formatted) {
      continue;
    }
    if (check) {
      stale.push(relative(repoRoot, path));
    } else {
      writeFileSync(path, formatted);
    }
  }
  if (check && stale.length > 0) {
    throw new Error(`${stale.join(", ")} out of date. Run ${command}.`);
  }
}
