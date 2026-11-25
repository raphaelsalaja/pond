#!/usr/bin/env node
/** Writes installer sizes and the largest packaged entries to the GitHub job summary, so each pull request shows what the app weighs. */

import { appendFileSync, existsSync, lstatSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

const dist = resolve(import.meta.dirname, "../dist");
const INSTALLER = /\.(dmg|exe|AppImage|deb|zip)$/;
const TOP = 15;
const MB = 1024 * 1024;

/** Symlinks are skipped: macOS frameworks link their own Versions folders, which would count twice. */
function sizeOf(path) {
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) return 0;
  if (!stat.isDirectory()) return stat.size;
  let total = 0;
  for (const name of readdirSync(path)) total += sizeOf(join(path, name));
  return total;
}

const mb = (bytes) => `${(bytes / MB).toFixed(1)} MB`;

/** `Pond.app/Contents` on macOS, the `*-unpacked` folder elsewhere. */
function packagedRoots() {
  return readdirSync(dist, { withFileTypes: true }).flatMap((entry) => {
    if (!entry.isDirectory()) return [];
    const dir = join(dist, entry.name);
    const app = readdirSync(dir).find((name) => name.endsWith(".app"));
    if (app) return [join(dir, app, "Contents")];
    return existsSync(join(dir, "resources")) ? [dir] : [];
  });
}

function largestEntries(root) {
  const resourcesName =
    readdirSync(root).find((name) => name.toLowerCase() === "resources") ??
    "resources";
  const resources = join(root, resourcesName);
  const expanded = [
    root,
    join(root, "Frameworks"),
    join(root, "Frameworks", "Electron Framework.framework", "Versions", "A"),
    resources,
    join(resources, "app.asar.unpacked"),
    join(resources, "app.asar.unpacked", "node_modules"),
  ].filter((dir) => existsSync(dir));
  const isExpanded = (path) =>
    expanded.some((dir) => dir === path || dir.startsWith(`${path}${sep}`));
  return expanded
    .flatMap((dir) => readdirSync(dir).map((name) => join(dir, name)))
    .flatMap((path) =>
      isExpanded(path)
        ? []
        : [{ path: relative(root, path), bytes: sizeOf(path) }],
    )
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, TOP);
}

const lines = ["## Package size", "", "| Installer | Size |", "| --- | ---: |"];
for (const name of readdirSync(dist)
  .filter((n) => INSTALLER.test(n))
  .sort()) {
  lines.push(`| ${name} | ${mb(sizeOf(join(dist, name)))} |`);
}
for (const root of packagedRoots()) {
  lines.push(
    "",
    `### ${relative(dist, root)}: ${mb(sizeOf(root))}`,
    "",
    "| Entry | Size |",
    "| --- | ---: |",
  );
  for (const { path, bytes } of largestEntries(root)) {
    lines.push(`| \`${path}\` | ${mb(bytes)} |`);
  }
}

const report = `${lines.join("\n")}\n`;
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
}
process.stdout.write(report);
