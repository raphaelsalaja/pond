import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { parseSync, Visitor } from "oxc-parser";

const repository = resolve(import.meta.dirname, "..");
const desktop = join(repository, "apps/desktop/src");
const workspaceRoots = ["apps", "packages"];

export function runtimeImports(
  source,
  filename = "module.ts",
  includeTypes = false,
) {
  const parsed = parseSync(filename, source);
  if (parsed.errors.length) {
    throw new Error(
      `Cannot parse ${filename}: ${parsed.errors.map((error) => error.message).join("; ")}`,
    );
  }
  const imports = [];
  new Visitor({
    ImportDeclaration(node) {
      const onlyTypes =
        node.importKind === "type" ||
        (node.specifiers.length > 0 &&
          node.specifiers.every(
            (entry) =>
              entry.type === "ImportSpecifier" && entry.importKind === "type",
          ));
      if (includeTypes || !onlyTypes) {
        imports.push(node.source.value);
      }
    },
    ExportNamedDeclaration(node) {
      const onlyTypes =
        node.exportKind === "type" ||
        (node.specifiers.length > 0 &&
          node.specifiers.every((entry) => entry.exportKind === "type"));
      if (node.source && (includeTypes || !onlyTypes)) {
        imports.push(node.source.value);
      }
    },
    ExportAllDeclaration(node) {
      if (includeTypes || node.exportKind !== "type") {
        imports.push(node.source.value);
      }
    },
    ImportExpression(node) {
      if (node.source.type === "Literal" && node.source.raw?.startsWith('"')) {
        imports.push(node.source.value);
      } else if (
        node.source.type === "Literal" &&
        node.source.raw?.startsWith("'")
      ) {
        imports.push(node.source.value);
      }
    },
  }).visit(parsed.program);
  return imports;
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (
      [".next", ".output", "dist", "generated", "node_modules", "out"].includes(
        entry.name,
      )
    ) {
      return [];
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(path);
    }
    return /\.(ts|tsx)$/.test(path) &&
      !/\.(test|d)\.tsx?$/.test(path) &&
      entry.name !== "routeTree.gen.ts"
      ? [path]
      : [];
  });
}

function workspacePackages() {
  return workspaceRoots.flatMap((root) => {
    const directory = join(repository, root);
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      if (!entry.isDirectory()) {
        return [];
      }
      const path = join(directory, entry.name);
      const manifestPath = join(path, "package.json");
      if (!existsSync(manifestPath)) {
        return [];
      }
      return [
        { path, manifest: JSON.parse(readFileSync(manifestPath, "utf8")) },
      ];
    });
  });
}

export function declaredWorkspaceDependencyErrors(packages) {
  const workspaceNames = new Set(
    packages.map(({ manifest }) => manifest.name).filter(Boolean),
  );
  const errors = [];
  for (const { path, manifest } of packages) {
    const declared = new Set(
      Object.keys({
        ...manifest.dependencies,
        ...manifest.devDependencies,
        ...manifest.optionalDependencies,
        ...manifest.peerDependencies,
      }),
    );
    for (const source of sourceFiles(path)) {
      const imports = runtimeImports(
        readFileSync(source, "utf8"),
        source,
        true,
      );
      for (const specifier of imports) {
        if (!specifier.startsWith("@")) {
          continue;
        }
        const dependency = specifier.split("/").slice(0, 2).join("/");
        if (
          dependency === manifest.name ||
          !workspaceNames.has(dependency) ||
          declared.has(dependency)
        ) {
          continue;
        }
        errors.push(
          `${manifest.name} imports undeclared workspace dependency ${dependency}: ${relative(repository, source)}`,
        );
      }
    }
  }
  return errors;
}

function resolveImport(source, specifier) {
  let base;
  if (specifier.startsWith("@/")) {
    base = join(desktop, "renderer/src", specifier.slice(2));
  } else if (specifier.startsWith("@shared/")) {
    base = join(desktop, "shared", specifier.slice(8));
  } else if (specifier.startsWith("@main/")) {
    base = join(desktop, "main", specifier.slice(6));
  } else if (specifier.startsWith(".")) {
    base = resolve(dirname(source), specifier);
  } else {
    return null;
  }
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  if (extname(base) === ".js") {
    candidates.push(`${base.slice(0, -3)}.ts`);
  }
  return (
    candidates.find(
      (candidate) => existsSync(candidate) && /\.tsx?$/.test(candidate),
    ) ?? null
  );
}

export function dependencyCycles(graph) {
  const index = new Map();
  const low = new Map();
  const stack = [];
  const active = new Set();
  const cycles = [];
  const visit = (node) => {
    const current = index.size;
    index.set(node, current);
    low.set(node, current);
    stack.push(node);
    active.add(node);
    for (const target of graph.get(node) ?? []) {
      if (!index.has(target)) {
        visit(target);
        low.set(node, Math.min(low.get(node), low.get(target)));
      } else if (active.has(target)) {
        low.set(node, Math.min(low.get(node), index.get(target)));
      }
    }
    if (low.get(node) !== index.get(node)) {
      return;
    }
    const group = [];
    let member;
    do {
      member = stack.pop();
      active.delete(member);
      group.push(member);
    } while (member !== node);
    if (group.length > 1 || graph.get(node)?.includes(node)) {
      cycles.push(group.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    }
  };
  for (const node of graph.keys()) {
    if (!index.has(node)) {
      visit(node);
    }
  }
  return cycles;
}

export function rendererOwnershipError(from, to) {
  if (
    from.startsWith("renderer/src/features/saves/") &&
    to.startsWith("renderer/src/features/library/")
  ) {
    return `Save code depends on Library code: ${from} -> ${to}`;
  }
  return null;
}

export function featureEntryError(from, to) {
  const source = /^renderer\/src\/features\/([^/]+)\//.exec(from);
  const target = /^renderer\/src\/features\/([^/]+)\/(.+)$/.exec(to);
  if (!source || !target || source[1] === target[1]) {
    return null;
  }
  if (!target[2].includes("/")) {
    return null;
  }
  return `Cross-feature import bypasses the feature entry: ${from} -> ${to}`;
}

function main() {
  const files = sourceFiles(desktop);
  const graph = new Map();
  const errors = declaredWorkspaceDependencyErrors(workspacePackages());
  for (const source of files) {
    const content = readFileSync(source, "utf8");
    const dependencies = runtimeImports(content, source)
      .map((specifier) => resolveImport(source, specifier))
      .filter(Boolean);
    graph.set(source, dependencies);
    const from = relative(desktop, source);
    const allDependencies = runtimeImports(content, source, true)
      .map((specifier) => resolveImport(source, specifier))
      .filter(Boolean);
    for (const target of allDependencies) {
      const to = relative(desktop, target);
      const ownershipError =
        rendererOwnershipError(from, to) ?? featureEntryError(from, to);
      if (ownershipError) {
        errors.push(ownershipError);
      }
      if (
        from.startsWith("renderer/src/shared/") &&
        /renderer\/src\/(features|app|dev|routes)\//.test(to)
      ) {
        errors.push(
          `Shared code depends on application code: ${from} -> ${to}`,
        );
      }
      if (
        (from.startsWith("renderer/") && to.startsWith("main/")) ||
        (from.startsWith("main/") && to.startsWith("renderer/")) ||
        (from.startsWith("shared/") && /^(main|renderer|preload)\//.test(to))
      ) {
        errors.push(`Process implementation import: ${from} -> ${to}`);
      }
      if (to === "main/index.ts" && from !== to) {
        errors.push(`Startup entrypoint imported: ${from}`);
      }
    }
  }
  for (const cycle of dependencyCycles(graph)) {
    errors.push(
      `Runtime dependency cycle:\n  ${cycle.map((path) => relative(desktop, path)).join("\n  ")}`,
    );
  }
  if (errors.length) {
    for (const error of errors) {
      process.stderr.write(`${error}\n`);
    }
    process.exitCode = 1;
  } else {
    process.stdout.write(
      `Architecture verified across ${files.length} desktop modules.\n`,
    );
  }
}

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  main();
}
