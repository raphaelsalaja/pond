/** Generates index.ts from the SVG sources in svg/. */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { emit, fileName, packageRoot, repoRoot } from "./lib.mjs";

const check = process.argv.includes("--check");
const command = "pnpm --filter @pond/icons generate";

const ROOT = /^<svg\b([^>]*\bviewBox="0 0 18 18"[^>]*)>([\s\S]*)<\/svg>\s*$/;
const ELEMENT = /<(path|circle|rect)\s([^>]*?)\/>/g;
const ATTRIBUTE = /([\w-]+)="([^"]*)"/g;

const camel = (name) => name.replace(/-(\w)/g, (_, c) => c.toUpperCase());
const pascal = (file) =>
  file
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");

function parse(path) {
  const svg = readFileSync(path, "utf8");
  const match = ROOT.exec(svg);
  if (!match) throw new Error(`${path}: expected an 18×18 <svg>.`);
  const [, root, body] = match;
  const nodes = [...body.matchAll(ELEMENT)].map(([, tag, attrs]) => [
    tag,
    Object.fromEntries(
      [...attrs.matchAll(ATTRIBUTE)].map(([, k, v]) => [camel(k), v]),
    ),
  ]);
  const rest = body.replace(ELEMENT, "").trim();
  if (rest) throw new Error(`${path}: unsupported markup ${rest.slice(0, 40)}`);
  const style = /\bfill="currentColor"/.test(root) ? "fill" : "outline";
  return { style, nodes };
}

function glyphs() {
  const dir = resolve(packageRoot, "svg");
  const found = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".svg")) continue;
    const glyph = pascal(file.slice(0, -4));
    if (fileName(glyph) !== file.slice(0, -4)) {
      throw new Error(`svg/${file}: rename to ${fileName(glyph)}.svg`);
    }
    found.push([glyph, parse(resolve(dir, file))]);
  }
  return found.sort(([a], [b]) => (a < b ? -1 : 1));
}

const IMPORT = /import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*"@pond\/icons"/g;

function imported() {
  const files = execFileSync(
    "git",
    ["ls-files", "-co", "--exclude-standard", "apps", "packages"],
    { cwd: repoRoot, encoding: "utf8" },
  )
    .split("\n")
    .filter(
      (file) =>
        /\.(ts|tsx|mts)$/.test(file) &&
        !file.startsWith("packages/icons/") &&
        existsSync(resolve(repoRoot, file)),
    );
  const names = new Set();
  for (const file of files) {
    const text = readFileSync(resolve(repoRoot, file), "utf8");
    for (const [, specifiers] of text.matchAll(IMPORT)) {
      for (const specifier of specifiers.split(",")) {
        const name = specifier
          .trim()
          .replace(/^type\s+/, "")
          .split(/\s+as\s+/)[0];
        if (name) names.add(name);
      }
    }
  }
  return names;
}

const all = glyphs();
const exports = all.map(
  ([glyph, { style, nodes }]) =>
    `export const Icon${glyph} = /* @__PURE__ */ createIcon(${JSON.stringify(glyph)}, ${JSON.stringify(style)}, ${JSON.stringify(nodes)});`,
);

emit(
  [
    [
      resolve(packageRoot, "index.ts"),
      `import { createIcon } from "./create-icon";\n\n${exports.join("\n")}\n`,
    ],
  ],
  { check, command },
);

const used = imported();
const unused = all
  .map(([glyph]) => `Icon${glyph}`)
  .filter((name) => !used.has(name));
console.log(`${check ? "Verified" : "Wrote"} index.ts (${all.length} icons)`);
if (unused.length > 0) {
  console.log(`Not imported outside @pond/icons: ${unused.join(", ")}`);
}
