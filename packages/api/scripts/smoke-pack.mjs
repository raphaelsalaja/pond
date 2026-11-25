import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8"),
);
const sandbox = mkdtempSync(join(tmpdir(), "pond-api-pack-"));
const project = join(sandbox, "project");
const packDirectory = join(sandbox, "pack");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const tsc = join(packageRoot, "node_modules", ".bin", "tsc");

function run(command, args, cwd, env = process.env) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.join(" ")} exited with code ${result.status}.`,
        result.stdout.trim(),
        result.stderr.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result.stdout;
}

const consumer = `import { API_VERSION, PondApi } from "pond-api";

const api = new PondApi({
  token: "secret",
  fetch: async () =>
    new Response(
      JSON.stringify({
        status: "success",
        data: [{ name: "design", count: 2, starred: false }],
      }),
    ),
});
const tags = await api.tags();
if (tags[0]?.name !== "design") throw new Error("tags() did not parse");
void api.query({ keywords: "posters", include: ["saves"] }).catch(() => {});
console.log(API_VERSION);
`;
const typedConsumer = `import type { ApiTag } from "pond-api";
${consumer}
const typed: ApiTag[] = tags;
void typed;
`;

try {
  mkdirSync(project, { recursive: true });
  mkdirSync(packDirectory, { recursive: true });
  const env = {
    ...process.env,
    npm_config_audit: "false",
    npm_config_cache: join(sandbox, "npm-cache"),
    npm_config_fund: "false",
    npm_config_update_notifier: "false",
    npm_config_userconfig: join(sandbox, "npmrc"),
  };
  writeFileSync(join(sandbox, "npmrc"), "");
  writeFileSync(
    join(project, "package.json"),
    `${JSON.stringify({ name: "pond-api-smoke", private: true, type: "module" }, null, 2)}\n`,
  );
  writeFileSync(join(project, "consumer.ts"), typedConsumer);
  writeFileSync(join(project, "consumer.mjs"), consumer);
  writeFileSync(
    join(project, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          lib: ["ES2022", "DOM"],
          strict: true,
          noEmit: true,
          skipLibCheck: false,
        },
        include: ["consumer.ts"],
      },
      null,
      2,
    )}\n`,
  );

  run(pnpm, ["pack", "--pack-destination", packDirectory], packageRoot, env);
  const tarball = join(
    packDirectory,
    `${manifest.name}-${manifest.version}.tgz`,
  );
  run(
    npm,
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
    project,
    env,
  );
  const installed = JSON.parse(
    readFileSync(
      join(project, "node_modules", "pond-api", "package.json"),
      "utf8",
    ),
  );
  if (JSON.stringify(installed).includes("workspace:")) {
    throw new Error("The packed manifest still has workspace: dependencies.");
  }
  if (installed.exports["."].import !== "./dist/index.js") {
    throw new Error("The packed manifest doesn't point at dist.");
  }

  run(tsc, ["-p", "tsconfig.json"], project, env);
  const version = run(process.execPath, ["consumer.mjs"], project, env).trim();
  process.stdout.write(
    `Installed pond-api ${manifest.version}, typechecked a consumer, and read API ${version}.\n`,
  );
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
