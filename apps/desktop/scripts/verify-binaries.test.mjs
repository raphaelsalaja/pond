import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import { afterEach, describe, it } from "node:test";

const { verifySharpRuntime } = createRequire(import.meta.url)(
  "./verify-binaries.cjs",
);

const roots = [];

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots.length = 0;
});

function runtimeTree() {
  const root = mkdtempSync(join(tmpdir(), "pond-sharp-"));
  roots.push(root);
  const unpacked = join(root, "app.asar.unpacked", "node_modules", "@img");
  writePackage(unpacked, "sharp-darwin-arm64", "sharp-darwin-arm64.node");
  writePackage(unpacked, "sharp-libvips-darwin-arm64", "libvips.dylib");
  writePackage(unpacked, "sharp-darwin-x64", "sharp-darwin-x64.node");
  writePackage(unpacked, "sharp-libvips-darwin-x64", "libvips.dylib");
  writePackage(unpacked, "unrelated-darwin-arm64", "binding.node");
  return root;
}

function writePackage(unpacked, name, file) {
  const dir = join(unpacked, name, "lib");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, file), "binary");
}

describe("verifySharpRuntime", () => {
  it("keeps the packaged architecture and removes the other", () => {
    const root = runtimeTree();
    verifySharpRuntime(root, "x64");
    const unpacked = join(root, "app.asar.unpacked");
    assert.deepEqual(list(unpacked), [
      "node_modules/@img/sharp-darwin-x64/lib/sharp-darwin-x64.node",
      "node_modules/@img/sharp-libvips-darwin-x64/lib/libvips.dylib",
      "node_modules/@img/unrelated-darwin-arm64/lib/binding.node",
    ]);
  });

  it("fails when the Intel runtime was not packaged", () => {
    const root = runtimeTree();
    rmSync(
      join(
        root,
        "app.asar.unpacked",
        "node_modules",
        "@img",
        "sharp-darwin-x64",
      ),
      { recursive: true },
    );
    rmSync(
      join(
        root,
        "app.asar.unpacked",
        "node_modules",
        "@img",
        "sharp-libvips-darwin-x64",
      ),
      { recursive: true },
    );
    assert.throws(() => verifySharpRuntime(root, "x64"), /darwin-x64/);
  });
});

function list(root) {
  return readdirSync(root, { recursive: true })
    .map((entry) => String(entry).split(sep).join("/"))
    .filter((entry) => entry.endsWith(".node") || entry.endsWith(".dylib"))
    .sort();
}
