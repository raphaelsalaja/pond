import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { parseSync } from "oxc-parser";

const { packageName, runtimePackages, verifyRuntimePackages } = createRequire(
  import.meta.url,
)("./verify-runtime-packages.cjs");

const roots = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

/** Writes a real asar (pickled JSON index, then file bytes) so the check reads what electron-builder emits. */
function packagedResources(files, unpacked = {}) {
  const resources = mkdtempSync(join(tmpdir(), "pond-runtime-packages-"));
  roots.push(resources);
  const tree = { files: {} };
  const chunks = [];
  let offset = 0;
  const entries = [
    ...Object.entries(files).map(([path, text]) => [path, text, false]),
    ...Object.entries(unpacked).map(([path, text]) => [path, text, true]),
  ];
  for (const [path, text, isUnpacked] of entries) {
    const parts = path.split("/");
    let node = tree;
    for (const part of parts.slice(0, -1)) {
      node.files[part] ??= { files: {} };
      node = node.files[part];
    }
    const bytes = Buffer.from(text);
    if (isUnpacked) {
      node.files[parts.at(-1)] = { size: bytes.length, unpacked: true };
      const target = join(resources, "app.asar.unpacked", ...parts);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
      continue;
    }
    node.files[parts.at(-1)] = { size: bytes.length, offset: String(offset) };
    offset += bytes.length;
    chunks.push(bytes);
  }
  const json = Buffer.from(JSON.stringify(tree));
  const padded = Math.ceil(json.length / 4) * 4;
  const header = Buffer.alloc(16 + padded);
  header.writeUInt32LE(4, 0);
  header.writeUInt32LE(8 + padded, 4);
  header.writeUInt32LE(4 + padded, 8);
  header.writeUInt32LE(json.length, 12);
  json.copy(header, 16);
  writeFileSync(
    join(resources, "app.asar"),
    Buffer.concat([header, ...chunks]),
  );
  return resources;
}

void describe("verifyRuntimePackages", () => {
  const main = {
    "out/main/index.js": 'import sharp from "sharp";\nrequire("re2");',
  };

  void it("fails when main loads a package app.asar does not ship", async () => {
    await assert.rejects(
      verifyRuntimePackages(packagedResources(main)),
      /missing packages .*sharp \(out\/main\/index\.js\)/,
    );
  });

  void it("passes when the package ships packed or unpacked, and skips optional loads", async () => {
    await verifyRuntimePackages(
      packagedResources({ ...main, "node_modules/sharp/package.json": "{}" }),
    );
    await verifyRuntimePackages(
      packagedResources(main, { "node_modules/sharp/package.json": "{}" }),
    );
  });

  void it("fails when an unpacked package was pruned after packing", async () => {
    const resources = packagedResources(main, {
      "node_modules/sharp/package.json": "{}",
    });
    rmSync(join(resources, "app.asar.unpacked"), { recursive: true });
    await assert.rejects(verifyRuntimePackages(resources), /sharp/);
  });

  void it("fails when a shipped package's own dependency is missing", async () => {
    const sharp = JSON.stringify({
      dependencies: { "detect-libc": "^2", "node-addon-api": "^8" },
    });
    await assert.rejects(
      verifyRuntimePackages(
        packagedResources({
          ...main,
          "node_modules/sharp/package.json": sharp,
        }),
      ),
      /detect-libc \(needed by sharp\)/,
    );
  });

  void it("resolves dependencies nested or hoisted and skips install-only ones", async () => {
    const sharp = JSON.stringify({
      dependencies: {
        "detect-libc": "^2",
        semver: "^7",
        "node-addon-api": "^8",
      },
    });
    await verifyRuntimePackages(
      packagedResources(
        {
          ...main,
          "node_modules/sharp/package.json": sharp,
          "node_modules/sharp/node_modules/semver/package.json": "{}",
        },
        { "node_modules/detect-libc/package.json": "{}" },
      ),
    );
  });
});

function packagesIn(code) {
  return [...runtimePackages(parseSync("chunk.js", code).program)].sort(
    (a, b) => (a < b ? -1 : a > b ? 1 : 0),
  );
}

void describe("runtimePackages", () => {
  void it("collects static, dynamic, and require-like loads", () => {
    const code = [
      'import sharp from "sharp";',
      'export { load } from "sqlite-vec";',
      'export * from "@scope/pkg/sub";',
      'const ort = requireFromHere("onnxruntime-node");',
      'const re2 = __require("re2");',
      'const manifest = __require.resolve("got/package.json");',
      'await import("better-sqlite3");',
    ].join("\n");
    assert.deepEqual(packagesIn(code), [
      "@scope/pkg",
      "better-sqlite3",
      "got",
      "onnxruntime-node",
      "re2",
      "sharp",
      "sqlite-vec",
    ]);
  });

  void it("ignores builtins, relative chunks, comments, and code-generation strings", () => {
    const code = [
      'import { join } from "node:path";',
      'import fs from "fs";',
      'import { app } from "electron";',
      'import { chunk } from "./vendor-hono.js";',
      "/** import { Hono } from 'hono'; const pako = require('pako'); */",
      'const template = `require("ajv/dist/runtime/equal")`;',
      "const dynamic = require(name);",
    ].join("\n");
    assert.deepEqual(packagesIn(code), []);
  });
});

void describe("packageName", () => {
  void it("keeps the scope and drops subpaths", () => {
    assert.equal(
      packageName("@huggingface/transformers/dist/x.js"),
      "@huggingface/transformers",
    );
    assert.equal(packageName("sharp/lib/index.js"), "sharp");
    assert.equal(packageName("fs/promises"), null);
    assert.equal(packageName("#internal"), null);
  });
});
