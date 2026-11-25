const {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
} = require("node:fs");
const { builtinModules } = require("node:module");
const nodePath = require("node:path");
const { parseSync, Visitor } = require("oxc-parser");
const { z } = require("zod");

/**
 * Packages the bundled main or preload code names without needing them on disk.
 * Each one is reached through a guarded load that falls back when it is missing.
 */
const OPTIONAL_PACKAGES = new Map([
  ["re2", "url-regex-safe falls back to RegExp without it"],
  [
    "got",
    "reachable-url probes it in try/catch, and only for a cache Pond never passes",
  ],
  [
    "cacheable-request",
    "reachable-url probes it in try/catch, and only for a cache Pond never passes",
  ],
]);

/** Declared dependencies of shipped packages that only their install step uses. */
const INSTALL_ONLY = new Map([
  [
    "node-addon-api",
    "C++ headers better-sqlite3 compiles against; the prebuilt binary never loads them",
  ],
  ["adm-zip", "onnxruntime-node's postinstall downloader"],
  ["global-agent", "onnxruntime-node's postinstall downloader"],
]);

const Manifest = z.object({
  dependencies: z.record(z.string(), z.string()).default({}),
});

const BUILTINS = new Set([...builtinModules, "electron", "original-fs"]);
const PACKAGE_NAME = /^(?:@[a-z0-9][\w.~-]*\/)?[a-z0-9][\w.~-]*$/i;
const RUNTIME_CODE = /^out\/(?:main|preload)\/.+\.(?:c|m)?js$/;

/**
 * Fails the pack when main or preload loads a package that app.asar does not ship.
 * The renderer is bundled whole by Vite and cannot require packages, so it is not scanned.
 */
async function verifyRuntimePackages(resourcesDir) {
  const asarPath = nodePath.join(resourcesDir, "app.asar");
  if (!existsSync(asarPath)) {
    return;
  }
  const archive = openArchive(asarPath);
  try {
    const references = new Map();
    for (const [path, entry] of archive.files) {
      if (!RUNTIME_CODE.test(path) || entry.unpacked) continue;
      const { program, errors } = parseSync(path, archive.read(entry));
      if (errors.length > 0) {
        throw new Error(
          `[pond verify] could not parse ${path}: ${errors[0].message}`,
        );
      }
      for (const name of runtimePackages(program)) {
        if (!references.has(name)) references.set(name, new Set());
        references.get(name).add(path);
      }
    }
    const required = [...references].filter(
      ([name]) => !OPTIONAL_PACKAGES.has(name),
    );
    const missing = required.flatMap(([name, paths]) =>
      hasPackage(archive, resourcesDir, `node_modules/${name}`)
        ? []
        : [`${name} (${[...paths].join(", ")})`],
    );
    missing.push(
      ...missingDependencies(
        archive,
        resourcesDir,
        required.map(([name]) => name),
      ),
    );
    if (missing.length > 0) {
      throw new Error(
        "[pond verify] app.asar is missing packages that main or preload " +
          `load at runtime: ${missing.join("; ")}. ` +
          "Add them to the node_modules list in electron-builder.yml files.",
      );
    }
    console.log(
      `[pond verify] runtime packages OK (${[...references.keys()].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)).join(", ")})`,
    );
  } finally {
    archive.close();
  }
}

/** Package names a module loads by a literal specifier: imports, re-exports, import(), and any require-like call. */
function runtimePackages(program) {
  const names = new Set();
  const add = (node) => {
    if (node?.type !== "Literal") return;
    const specifier = z.string().safeParse(node.value);
    const name = specifier.success ? packageName(specifier.data) : null;
    if (name) names.add(name);
  };
  const addSource = (node) => add(node.source);
  new Visitor({
    ImportDeclaration: addSource,
    ExportAllDeclaration: addSource,
    ExportNamedDeclaration: addSource,
    ImportExpression: addSource,
    CallExpression(node) {
      if (isRequireLike(node.callee)) add(node.arguments[0]);
    },
  }).visit(program);
  return names;
}

/** `require`, `__require`, `requireFromHere`, and their `.resolve`: bundled libraries load packages through all of these. */
function isRequireLike(callee) {
  if (callee.type === "Identifier") return /require/i.test(callee.name);
  return (
    callee.type === "MemberExpression" &&
    callee.object.type === "Identifier" &&
    /require/i.test(callee.object.name) &&
    callee.property.type === "Identifier" &&
    callee.property.name === "resolve"
  );
}

function packageName(specifier) {
  if (/^[./#]/.test(specifier) || specifier.startsWith("node:")) return null;
  const parts = specifier.split("/");
  const name = specifier.startsWith("@")
    ? parts.slice(0, 2).join("/")
    : parts[0];
  if (BUILTINS.has(name) || BUILTINS.has(specifier)) return null;
  return PACKAGE_NAME.test(name) ? name : null;
}

/** Walks each shipped package's declared dependencies the way Node resolves them, from nested node_modules up to the top. */
function missingDependencies(archive, resourcesDir, roots) {
  const missing = [];
  const visited = new Set();
  const queue = roots.map((name) => ({ name, dir: `node_modules/${name}` }));
  while (queue.length > 0) {
    const { name, dir } = queue.shift();
    if (visited.has(dir)) continue;
    visited.add(dir);
    const manifest = readManifest(archive, resourcesDir, dir);
    if (!manifest) continue;
    for (const dependency of Object.keys(manifest.dependencies)) {
      if (INSTALL_ONLY.has(dependency)) continue;
      const resolved = resolveDependency(
        archive,
        resourcesDir,
        dir,
        dependency,
      );
      if (resolved) queue.push({ name: dependency, dir: resolved });
      else missing.push(`${dependency} (needed by ${name})`);
    }
  }
  return missing;
}

function resolveDependency(archive, resourcesDir, fromDir, name) {
  let base = fromDir;
  for (;;) {
    const candidate = `${base}/node_modules/${name}`;
    if (hasPackage(archive, resourcesDir, candidate)) return candidate;
    const parent = base.lastIndexOf("/node_modules/");
    if (parent === -1) break;
    base = base.slice(0, parent);
  }
  const topLevel = `node_modules/${name}`;
  return hasPackage(archive, resourcesDir, topLevel) ? topLevel : null;
}

function hasPackage(archive, resourcesDir, dir) {
  return readManifest(archive, resourcesDir, dir) !== null;
}

/** A package counts as shipped when its manifest is packed, or unpacked and still on disk after afterPack pruning. */
function readManifest(archive, resourcesDir, dir) {
  const entry = archive.files.get(`${dir}/package.json`);
  if (!entry) {
    return null;
  }
  if (!entry.unpacked) {
    return Manifest.parse(JSON.parse(archive.read(entry)));
  }
  const path = nodePath.join(
    resourcesDir,
    "app.asar.unpacked",
    ...dir.split("/"),
    "package.json",
  );
  if (!existsSync(path)) return null;
  return Manifest.parse(JSON.parse(readFileSync(path, "utf8")));
}

/** Reads the asar header directly: the format is a JSON index after two size prefixes, then file bytes at a fixed base. */
function openArchive(path) {
  const fd = openSync(path, "r");
  const prefix = Buffer.alloc(16);
  readSync(fd, prefix, 0, 16, 0);
  const header = Buffer.alloc(prefix.readUInt32LE(12));
  readSync(fd, header, 0, header.length, 16);
  const base = 8 + prefix.readUInt32LE(4);
  const files = new Map();
  const index = (node, prefixPath) => {
    for (const [name, child] of Object.entries(node.files ?? {})) {
      const childPath = prefixPath ? `${prefixPath}/${name}` : name;
      if (child.files) index(child, childPath);
      else if (!child.link) files.set(childPath, child);
    }
  };
  index(JSON.parse(header.toString("utf8")), "");
  return {
    files,
    read(entry) {
      const bytes = Buffer.alloc(entry.size);
      readSync(fd, bytes, 0, entry.size, base + Number(entry.offset));
      return bytes.toString("utf8");
    },
    close: () => closeSync(fd),
  };
}

exports.verifyRuntimePackages = verifyRuntimePackages;
exports.runtimePackages = runtimePackages;
exports.packageName = packageName;
exports.OPTIONAL_PACKAGES = OPTIONAL_PACKAGES;
exports.INSTALL_ONLY = INSTALL_ONLY;
