/** Draws every `src/` script into `svg/`, rewrites its manifest variants, and redraws the registered parts from `src/parts`. */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { draw, helpers, toPart, values } from "../helpers.mjs";
import { packageRoot } from "./lib.mjs";

const at = (...p) => resolve(packageRoot, ...p);
const style = values(JSON.parse(readFileSync(at("style.json"), "utf8")));
const load = async (path) => import(pathToFileURL(path).href);

/** A drawing made only of solid parts ships as a fill icon. */
function render(script) {
  const parts = [script(helpers, style)].flat(Infinity).filter(Boolean);
  const solid = parts.every((p) => toPart(p).solid);
  if (!solid) return { style: "outline", svg: draw(script, style) };
  const body = draw(script, style)
    .match(/<path[\s\S]*<\/svg>$/)[0]
    .replaceAll(' fill="currentColor" stroke="none"', "");
  return {
    style: "fill",
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 18 18" fill="currentColor">${body}`,
  };
}

const manifestPath = at("svg/manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const scripts = readdirSync(at("src"))
  .filter((f) => f.endsWith(".mjs"))
  .map((f) => f.slice(0, -4));

const missing = scripts.filter((name) => !manifest[name]);
if (missing.length)
  throw new Error(`No manifest entry for src/${missing.join(", src/")}.mjs`);

for (const name of scripts) {
  const mod = await load(at("src", `${name}.mjs`));
  const dir = at("svg", name);
  mkdirSync(dir, { recursive: true });
  const variants = [];
  for (const [state, script] of [
    [null, mod.default],
    ["open", mod.open],
  ]) {
    if (!script) continue;
    const { style: kind, svg } = render(script);
    const file = `${name}/${kind}-18${state ? `-${state}` : ""}.svg`;
    writeFileSync(at("svg", file), `${svg}\n`);
    variants.push({ style: kind, size: 18, ...(state && { state }), file });
  }
  const keep = new Set(variants.map((v) => v.file.split("/")[1]));
  for (const file of readdirSync(dir))
    if (!keep.has(file)) rmSync(resolve(dir, file));
  manifest[name].variants = variants;
}

/** Marks without a script (the X and Threads post controls) keep their drawings but lose Duo. */
for (const [name, entry] of Object.entries(manifest)) {
  if (scripts.includes(name)) continue;
  for (const variant of entry.variants.filter((v) => v.style === "duo"))
    rmSync(at("svg", variant.file), { force: true });
  entry.variants = entry.variants.filter((v) => v.style !== "duo");
}
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const part = async (file) =>
  (await load(at("src/parts", `${file}.mjs`))).default;
const slash = await part("slash");
const registered = {
  folder: await part("folder"),
  file: await part("file"),
  ring: await part("ring"),
  slash: (_, s) => slash(s),
  tag: (await load(at("src/tag.mjs"))).default,
  sparkle: (await load(at("src/sparkle.mjs"))).default,
};
const { glyphs } = await load(at("src/parts/badge.mjs"));
for (const name of Object.keys(glyphs))
  registered[`badge-${name}`] = () => glyphs[name]();

for (const [name, script] of Object.entries(registered)) {
  if (existsSync(at("parts", `${name}.svg`)))
    writeFileSync(at("parts", `${name}.svg`), `${draw(script, style)}\n`);
}

console.log(
  `Drew ${scripts.length} icons into svg/ and ${Object.keys(registered).length} parts.`,
);
