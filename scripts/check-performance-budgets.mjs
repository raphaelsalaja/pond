import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

const workspace = resolve(import.meta.dirname, "..");
const results = [];

function addResult(name, bytes, budget) {
  results.push({ name, bytes, budget, ok: bytes <= budget });
}

function fileSize(path) {
  if (!existsSync(path)) throw new Error(`missing build artifact: ${path}`);
  return statSync(path).size;
}

function directorySize(path) {
  let total = 0;
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    total += entry.isDirectory() ? directorySize(child) : fileSize(child);
  }
  return total;
}

function mainStaticGraph(entry) {
  const seen = new Set();
  const visit = (path) => {
    const absolute = resolve(path);
    if (seen.has(absolute) || !existsSync(absolute)) return;
    seen.add(absolute);
    const source = readFileSync(absolute, "utf8");
    const staticImport = /(?:\bfrom\s*|^\s*import\s*)["'](\.\.?\/[^"']+)["']/gm;
    for (const match of source.matchAll(staticImport)) {
      let dependency = resolve(dirname(absolute), match[1]);
      if (!extname(dependency)) dependency += ".js";
      visit(dependency);
    }
  };
  visit(entry);
  return [...seen].reduce((total, path) => total + fileSize(path), 0);
}

function htmlAssetSize(htmlPath, assetRoot, pattern, filter = () => true) {
  const html = readFileSync(htmlPath, "utf8");
  const assets = new Set();
  for (const match of html.matchAll(pattern)) {
    if (filter(match[0])) assets.add(match[1]);
  }
  return [...assets].reduce(
    (total, asset) => total + fileSize(join(assetRoot, asset)),
    0,
  );
}

const desktopOut = join(workspace, "apps/desktop/out");
addResult(
  "desktop main static graph",
  mainStaticGraph(join(desktopOut, "main/index.js")),
  3_300_000,
);
addResult(
  "desktop renderer initial JS/CSS",
  htmlAssetSize(
    join(desktopOut, "renderer/index.html"),
    join(desktopOut, "renderer"),
    /(?:href|src)="\.\/([^"?#]+\.(?:js|css))/g,
  ),
  3_250_000,
);

const websiteRoot = join(workspace, "apps/website/.next");
addResult(
  "website modern initial JS",
  htmlAssetSize(
    join(websiteRoot, "server/app/index.html"),
    join(websiteRoot, "static"),
    /<(?:script|link)[^>]+(?:src|href)="\/_next\/static\/([^"?#]+\.js)"[^>]*>/g,
    (tag) => !tag.includes("noModule"),
  ),
  500_000,
);

const extensionOut = join(workspace, "apps/extension/.output/chrome-mv3");
/** The in-page overlay is a separate React bundle because content scripts can't share chunks with extension pages. */
addResult("extension unpacked total", directorySize(extensionOut), 1_950_000);
addResult(
  "extension service worker",
  fileSize(join(extensionOut, "background.js")),
  150_000,
);

let failed = false;
for (const result of results) {
  const status = result.ok ? "PASS" : "FAIL";
  const percent = ((result.bytes / result.budget) * 100).toFixed(1);
  console.log(
    `${status} ${result.name}: ${formatBytes(result.bytes)} / ${formatBytes(result.budget)} (${percent}%)`,
  );
  if (!result.ok) failed = true;
}

if (failed) process.exitCode = 1;

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}
