import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const packageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const repoRoot = resolve(packageRoot, "../..");

export const STYLES = ["outline", "fill"];

export function exportName(glyph, style) {
  return `Icon${glyph}${style === "fill" ? "Fill" : ""}`;
}

/** `ArrowRotate2` becomes `arrow-rotate-2`. */
export function fileName(glyph) {
  return glyph
    .replace(/([a-z])([A-Z0-9])/g, "$1-$2")
    .replace(/([0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

/** Generated files go through Biome so `--check` compares against what CI enforces. */
function format(path, source) {
  return execFileSync(
    process.execPath,
    [
      resolve(repoRoot, "node_modules/@biomejs/biome/bin/biome"),
      "check",
      "--write",
      `--stdin-file-path=${relative(repoRoot, path)}`,
    ],
    { cwd: repoRoot, encoding: "utf8", input: source },
  );
}

export function emit(outputs, { check, command }) {
  const stale = [];
  for (const [path, source] of outputs) {
    const formatted = format(path, source);
    const current = existsSync(path) ? readFileSync(path, "utf8") : null;
    if (current === formatted) continue;
    if (check) stale.push(relative(repoRoot, path));
    else writeFileSync(path, formatted);
  }
  if (check && stale.length > 0) {
    throw new Error(`${stale.join(", ")} out of date. Run ${command}.`);
  }
}
