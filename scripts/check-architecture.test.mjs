import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
  declaredWorkspaceDependencyErrors,
  dependencyCycles,
  featureEntryError,
  rendererOwnershipError,
  runtimeImports,
} from "./check-architecture.mjs";

void test("runtime graph distinguishes type-only imports and preserves lazy dependencies", () => {
  assert.deepEqual(
    runtimeImports(`
    import type { A } from './types';
    import { type B } from './also-types';
    import { type C, run } from './runtime';
    import './startup';
    export type { D } from './exports';
    export { type E } from './type-exports';
    export { work } from './work';
    const load = () => import('./lazy');
  `),
    ["./runtime", "./startup", "./work", "./lazy"],
  );
});

void test("detects cycles while permitting convergent dependencies", () => {
  const graph = new Map([
    ["a", ["b", "leaf"]],
    ["b", ["a", "leaf"]],
    ["leaf", []],
    ["c", ["leaf"]],
    ["self", ["self"]],
  ]);
  assert.deepEqual(dependencyCycles(graph), [["a", "b"], ["self"]]);
});

void test("ownership checks can include type-only imports and exports", () => {
  assert.deepEqual(
    runtimeImports(
      "import type { A } from './owner'; export type { B } from './other';",
      "module.ts",
      true,
    ),
    ["./owner", "./other"],
  );
});

void test("save features cannot depend on Library features", () => {
  assert.match(
    rendererOwnershipError(
      "renderer/src/features/saves/lib/menu.ts",
      "renderer/src/features/library/state/folders.ts",
    ),
    /Save code depends on Library code/,
  );
  assert.equal(
    rendererOwnershipError(
      "renderer/src/features/library/components/grid.tsx",
      "renderer/src/features/saves/components/card.tsx",
    ),
    null,
  );
});

void test("features import other features only through root entries", () => {
  assert.match(
    featureEntryError(
      "renderer/src/features/library/components/grid.tsx",
      "renderer/src/features/saves/state/pool.ts",
    ),
    /bypasses the feature entry/,
  );
  for (const to of [
    "renderer/src/features/saves/index.ts",
    "renderer/src/features/saves/pool.ts",
    "renderer/src/features/library/state/folders.ts",
    "renderer/src/shared/lib/format.ts",
  ]) {
    assert.equal(
      featureEntryError(
        "renderer/src/features/library/components/grid.tsx",
        to,
      ),
      null,
    );
  }
  assert.equal(
    featureEntryError(
      "renderer/src/app/index.tsx",
      "renderer/src/features/saves/state/pool.ts",
    ),
    null,
  );
});

void test("reports imports from undeclared workspace packages", () => {
  const root = mkdtempSync(join(tmpdir(), "pond-architecture-"));
  const app = join(root, "app");
  const shared = join(root, "shared");
  mkdirSync(join(app, "src"), { recursive: true });
  mkdirSync(shared, { recursive: true });
  writeFileSync(join(app, "src/index.ts"), 'import "@pond/shared";\n');
  const packages = [
    { path: app, manifest: { name: "@pond/app" } },
    { path: shared, manifest: { name: "@pond/shared" } },
  ];
  try {
    const errors = declaredWorkspaceDependencyErrors(packages);
    assert.equal(errors.length, 1);
    assert.match(
      errors[0],
      /@pond\/app imports undeclared workspace dependency @pond\/shared/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
