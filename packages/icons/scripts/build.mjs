/** Checks svg/manifest.json and migration.json, then generates index.ts, concepts.md, the README counts, and lab/data.js. */
import { execFileSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { flatten, segments } from "./geometry.mjs";
import { emit, fileName, packageRoot, repoRoot } from "./lib.mjs";
import {
  conceptsTable,
  counts,
  cuts,
  partMisses,
  report,
  validate,
} from "./manifest.mjs";

const check = process.argv.includes("--check");
/** Skips index.ts so the manifest can be checked without Biome. */
const reportOnly = process.argv.includes("--report");
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
      [...attrs.matchAll(ATTRIBUTE)].map(([, k, v]) => [
        k === "class" ? "className" : camel(k),
        v,
      ]),
    ),
  ]);
  const rest = body.replace(ELEMENT, "").trim();
  if (rest) throw new Error(`${path}: unsupported markup ${rest.slice(0, 40)}`);
  const style = nodes.some(([, attrs]) => attrs.className === "bg")
    ? "duo"
    : /\bfill="currentColor"/.test(root)
      ? "fill"
      : "outline";
  const visible = /\boverflow="visible"/.test(root);
  return { style, nodes, visible };
}

/** Ink past the 0–18 frame, counting half the stroke on outline drawings. */
function overflow({ style, nodes, visible }) {
  if (visible) return 0;
  const half = style === "outline" ? 0.625 : 0;
  let past = 0;
  for (const [tag, attrs] of nodes) {
    for (const [x, y] of flatten(segments(tag, attrs), 0.1)) {
      past = Math.max(past, half - x, half - y, x + half - 18, y + half - 18);
    }
  }
  return past;
}

/** Reads every variant the manifest lists; the generator ships the 18 drawing of each state. */
function glyphs(manifest, miss) {
  const dir = resolve(packageRoot, "svg");
  const listed = new Set();
  const found = [];
  for (const [name, entry] of Object.entries(manifest)) {
    const glyph = pascal(name);
    if (fileName(glyph) !== name) {
      miss(`svg/${name}`, "name", `rename to ${fileName(glyph)}`);
    }
    for (const variant of entry.variants ?? []) {
      const file = `svg/${variant.file}`;
      listed.add(variant.file);
      const state = variant.state ? `-${variant.state}` : "";
      const expected = `${name}/${variant.style}-${variant.size}${state}.svg`;
      if (variant.file !== expected) {
        miss(file, "variant-path", `expected svg/${expected}`);
        continue;
      }
      if (!existsSync(resolve(dir, variant.file))) {
        miss(file, "variant-missing", "listed in the manifest, not drawn");
        continue;
      }
      if (variant.size !== 18) {
        miss(file, "variant-size", "only the 18 drawing is generated");
        continue;
      }
      const data = parse(resolve(dir, variant.file));
      if (data.nodes.length === 0) {
        miss(file, "variant-empty", "no artwork");
        continue;
      }
      if (data.style !== variant.style) {
        miss(
          file,
          "style-mismatch",
          `listed ${variant.style}, drawn ${data.style}`,
        );
      }
      const past = overflow(data);
      if (past > 0.01) {
        miss(
          file,
          "overflow",
          `artwork ${past.toFixed(2)} past the frame with no overflow="visible"`,
        );
      }
      const duo = variant.style === "duo" ? "Duo" : "";
      const open = variant.state === "open" ? "Open" : "";
      found.push([`${glyph}${duo}${open}`, data]);
    }
  }
  for (const folder of readdirSync(dir, { withFileTypes: true })) {
    if (!folder.isDirectory()) continue;
    if (!manifest[folder.name]) {
      miss(`svg/${folder.name}`, "manifest-missing", "no manifest entry");
      continue;
    }
    for (const file of readdirSync(resolve(dir, folder.name))) {
      if (!file.endsWith(".svg")) continue;
      if (!listed.has(`${folder.name}/${file}`)) {
        miss(
          `svg/${folder.name}/${file}`,
          "variant-unlisted",
          "drawn, not in the manifest",
        );
      }
    }
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

function parts(dir) {
  if (!existsSync(dir)) return new Map();
  return new Map(
    readdirSync(dir)
      .filter((file) => file.endsWith(".svg"))
      .sort()
      .map((file) => [file.slice(0, -4), parse(resolve(dir, file)).nodes]),
  );
}

/** Checks each Neutral drawing in a staged tree against the parts it names. A Duo file draws only its badges and slash as lines. */
function stagedMisses(root, label) {
  const path = resolve(root, "manifest.json");
  if (!existsSync(path)) return [];
  const misses = [];
  for (const [name, entry] of Object.entries(JSON.parse(readFileSync(path, "utf8")))) {
    const names = entry.parts ?? [];
    for (const [file, used] of [
      ["outline-18.svg", names],
      ["duo-18.svg", names.filter(cuts)],
    ]) {
      const drawing = resolve(root, name, file);
      if (!existsSync(drawing) || used.length === 0) continue;
      misses.push(
        ...partMisses(`${label}/${name}/${file}`, used, parse(drawing).nodes, seedParts, {
          dir: "seed/parts",
        }),
      );
    }
  }
  return misses;
}

const manifest = JSON.parse(
  readFileSync(resolve(packageRoot, "svg/manifest.json"), "utf8"),
);
const migration = JSON.parse(
  readFileSync(resolve(packageRoot, "migration.json"), "utf8"),
);
const misses = [];
const all = glyphs(manifest, (file, rule, message) =>
  misses.push({ file, rule, message }),
);
const registered = parts(resolve(packageRoot, "parts"));
const seedRoot = resolve(packageRoot, "seed");
const seedParts = parts(resolve(seedRoot, "parts"));
const nextRoot = resolve(packageRoot, "next");
misses.push(
  ...validate({
    glyphs: new Map(all.map(([glyph, data]) => [fileName(glyph), data])),
    manifest,
    migration,
    parts: registered,
  }),
);
/** Staged trees are drafts that never ship, so their drift warns instead of stopping the build. */
const staged = [...stagedMisses(seedRoot, "seed"), ...stagedMisses(nextRoot, "next")];
if (staged.length > 0) console.warn(`${staged.length} drifts in the seed/ and next/ drafts.`);
const reportPath = resolve(packageRoot, "REPORT.md");
if (misses.length > 0) {
  writeFileSync(reportPath, report(misses));
  console.error(`${misses.length} problems. See packages/icons/REPORT.md.`);
  process.exit(1);
}
rmSync(reportPath, { force: true });

const readmePath = resolve(packageRoot, "README.md");
const readme = readFileSync(readmePath, "utf8").replace(
  /(<!-- counts -->\n)[\s\S]*?(\n<!-- \/counts -->)/,
  `$1${counts(manifest, registered)}$2`,
);
const exports = all.map(
  ([glyph, { style, nodes }]) =>
    `export const Icon${glyph} = /* @__PURE__ */ createIcon(${JSON.stringify(glyph)}, ${JSON.stringify(style)}, ${JSON.stringify(nodes)});`,
);

emit(
  [
    [resolve(packageRoot, "concepts.md"), conceptsTable(manifest), true],
    [readmePath, readme, true],
    ...(reportOnly
      ? []
      : [
          [
            resolve(packageRoot, "index.ts"),
            `import { createIcon } from "./create-icon";\n\n${exports.join("\n")}\n`,
          ],
        ]),
  ],
  { check, command },
);

if (!check) writeLab();

/** The lab page opens from disk, where it can't fetch, so its data is a classic script. */
function writeLab() {
  const svgs = {};
  for (const [name, entry] of Object.entries(manifest)) {
    for (const variant of entry.variants) {
      if (variant.size !== 18) continue;
      const key = [name, variant.style === "duo" && "duo", variant.state]
        .filter(Boolean)
        .join("-");
      svgs[key] = readFileSync(
        resolve(packageRoot, "svg", variant.file),
        "utf8",
      );
    }
  }
  const icons = Object.fromEntries(
    all.map(([glyph, { style, nodes }]) => [fileName(glyph), { style, nodes }]),
  );
  const seed = {};
  for (const name of existsSync(seedRoot) ? readdirSync(seedRoot) : []) {
    const read = (file) => {
      const path = resolve(seedRoot, name, file);
      return existsSync(path) ? readFileSync(path, "utf8") : null;
    };
    if (!read("outline-18.svg")) continue;
    seed[name] = { outline: read("outline-18.svg"), duo: read("duo-18.svg") };
  }
  const staged = {};
  for (const name of existsSync(nextRoot) ? readdirSync(nextRoot) : []) {
    const read = (file) => {
      const path = resolve(nextRoot, name, file);
      return existsSync(path) ? readFileSync(path, "utf8") : null;
    };
    const files = {
      outline: read("outline-18.svg"),
      duo: read("duo-18.svg"),
      open: read("outline-18-open.svg"),
      duoOpen: read("duo-18-open.svg"),
      fill: read("fill-18.svg"),
    };
    if (files.outline || files.fill) staged[name] = files;
  }
  const readJson = (path) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {});
  const data = {
    manifest,
    migration,
    icons,
    svgs,
    seed,
    parts: Object.fromEntries(registered),
    seedParts: Object.fromEntries(
      [...seedParts.keys()].map((name) => [
        name,
        readFileSync(resolve(seedRoot, "parts", `${name}.svg`), "utf8"),
      ]),
    ),
    seedManifest: readJson(resolve(seedRoot, "manifest.json")),
    next: staged,
    nextManifest: readJson(resolve(nextRoot, "manifest.json")),
    nextFamilies: readJson(resolve(packageRoot, "draw/families.json")),
    nextAttempts: Object.fromEntries(
      (existsSync(resolve(nextRoot, ".meta")) ? readdirSync(resolve(nextRoot, ".meta")) : [])
        .filter((file) => file.endsWith(".json"))
        .flatMap((file) => Object.entries(readJson(resolve(nextRoot, ".meta", file))))
        .filter(([, entry]) => entry.attempts?.length)
        .map(([name, entry]) => [name, entry.attempts]),
    ),
  };
  writeFileSync(
    resolve(packageRoot, "lab/data.js"),
    `window.POND_ICONS = ${JSON.stringify(data)};\n`,
  );
}

const used = imported();
const unused = all
  .map(([glyph]) => `Icon${glyph}`)
  .filter((name) => !used.has(name));
console.log(
  `${check ? "Verified" : "Wrote"} ${reportOnly ? "concepts.md" : "index.ts"} (${all.length} icons)`,
);
if (unused.length > 0) {
  console.log(`Not imported outside @pond/icons: ${unused.join(", ")}`);
}
