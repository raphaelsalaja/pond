/** Copies this extension into a raycast/extensions checkout, pinned to the published pond-api. */
import { execFileSync } from "node:child_process";
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const FILES = [".prettierrc", "CHANGELOG.md", "README.md", "ai.yaml", "eslint.config.mjs", "tsconfig.json"];
const FOLDERS = ["assets", "metadata", "src", "tests"];
const MANAGED = new Set([...FILES, ...FOLDERS, "package.json", "package-lock.json", "node_modules"]);

const args = process.argv.slice(2);
const target = args.find((arg) => !arg.startsWith("--"));
const install = !args.includes("--no-install");

if (!target) {
  console.error("Usage: pnpm --dir apps/raycast store:sync <raycast-extensions>/extensions/pond [--no-install]");
  process.exit(1);
}

const destination = resolve(target);
const exists = (path) =>
  stat(path).then(
    () => true,
    () => false,
  );

if (!(await exists(join(destination, "..", "..", ".git")))) {
  console.error(`${destination} isn't inside a raycast/extensions checkout.`);
  process.exit(1);
}

const api = JSON.parse(await readFile(join(root, "..", "..", "packages", "api", "package.json"), "utf8"));
const published = execFileSync("npm", ["view", `pond-api@${api.version}`, "version"], { encoding: "utf8" }).trim();
if (published !== api.version) {
  console.error(`pond-api@${api.version} isn't on npm yet. Publish it before syncing the Store copy.`);
  process.exit(1);
}

await mkdir(destination, { recursive: true });
for (const file of FILES) await cp(join(root, file), join(destination, file));
for (const folder of FOLDERS) {
  if (!(await exists(join(root, folder)))) continue;
  await rm(join(destination, folder), { recursive: true, force: true });
  await cp(join(root, folder), join(destination, folder), { recursive: true });
}

const manifest = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
manifest.dependencies["pond-api"] = `^${api.version}`;
const { develop, "store:sync": _sync, ...scripts } = manifest.scripts;
manifest.scripts = { ...scripts, dev: develop };
await writeFile(join(destination, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);

const extra = (await readdir(destination)).filter((name) => !MANAGED.has(name));
if (extra.length) console.warn(`Left alone in the Store copy, check they still belong: ${extra.join(", ")}`);

if (install) {
  execFileSync("npm", ["install", "--no-audit", "--no-fund"], { cwd: destination, stdio: "inherit" });
  execFileSync("npm", ["run", "lint"], { cwd: destination, stdio: "inherit" });
  execFileSync("npm", ["test"], { cwd: destination, stdio: "inherit" });
}

console.log(`Synced to ${destination} with pond-api ^${api.version}.`);
