import { spawnSync } from "node:child_process";
import {
  existsSync,
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
const sandbox = mkdtempSync(join(tmpdir(), "pond-cli-pack-"));
const project = join(sandbox, "project");
const packDirectory = join(sandbox, "pack");
const home = join(sandbox, "home");
const cache = join(sandbox, "npm-cache");
const userConfig = join(sandbox, "npmrc");
const pondConfig = join(sandbox, "state", "cli.json");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args, cwd, env) {
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

try {
  mkdirSync(project, { recursive: true });
  mkdirSync(packDirectory, { recursive: true });
  mkdirSync(home, { recursive: true });
  writeFileSync(userConfig, "");
  writeFileSync(
    join(project, "package.json"),
    `${JSON.stringify(
      {
        name: "pond-cli-pack-smoke",
        version: "1.0.0",
        private: true,
      },
      null,
      2,
    )}\n`,
  );

  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(sandbox, "config"),
    APPDATA: join(sandbox, "app-data"),
    LOCALAPPDATA: join(sandbox, "local-app-data"),
    POND_CONFIG: pondConfig,
    npm_config_audit: "false",
    npm_config_cache: cache,
    npm_config_fund: "false",
    npm_config_prefix: join(sandbox, "npm-prefix"),
    npm_config_update_notifier: "false",
    npm_config_userconfig: userConfig,
  };
  run(pnpm, ["pack", "--pack-destination", packDirectory], packageRoot, env);
  const filename = `${manifest.name.replace(/^@/, "").replace("/", "-")}-${manifest.version}.tgz`;

  const tarball = join(packDirectory, filename);
  if (!existsSync(tarball)) {
    throw new Error(`pnpm pack did not create ${filename}.`);
  }
  run(
    npm,
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--save=false",
      tarball,
    ],
    project,
    env,
  );

  const executable = join(
    project,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "pond.cmd" : "pond",
  );
  const version = run(executable, ["--version"], project, env).trim();
  if (version !== manifest.version) {
    throw new Error(
      `Expected pond --version to print ${manifest.version}, received ${version}.`,
    );
  }
  if (existsSync(pondConfig)) {
    throw new Error("pond --version wrote CLI configuration.");
  }

  process.stdout.write(
    `Installed @pond/cli ${manifest.version} and verified pond --version.\n`,
  );
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}
