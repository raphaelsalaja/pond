#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = resolve(root, "resources/bin");
const src = resolve(root, "native-host/pond-native-host.c");
const out = resolve(
  outDir,
  process.platform === "win32" ? "pond-native-host.exe" : "pond-native-host",
);

if (process.platform !== "darwin" && process.platform !== "win32") {
  console.log("[pond] native host skipped (unsupported platform)");
  process.exit(0);
}

mkdirSync(outDir, { recursive: true });

const result =
  process.platform === "win32" ? buildWindowsHost() : buildUnixHost();
if (result.error || result.status !== 0) {
  console.error(
    "[pond] native host compile failed; context-menu capture requires it",
  );
  process.exit(1);
}

console.log(`[pond] native host ok (${out})`);

function buildUnixHost() {
  const compiler = process.env.CC || "cc";
  return spawnSync(compiler, ["-O2", "-o", out, src], { stdio: "inherit" });
}

function buildWindowsHost() {
  const temporary = mkdtempSync(join(tmpdir(), "pond-native-host-"));
  const object = resolve(temporary, "pond-native-host.obj");
  const compilerArgs = [
    "/nologo",
    "/O2",
    "/wd4067",
    src,
    `/Fo:${object}`,
    `/Fe:${out}`,
    "Advapi32.lib",
  ];
  try {
    const configuredCompiler = process.env.CC;
    if (configuredCompiler) {
      return spawnSync(configuredCompiler, compilerArgs, { stdio: "inherit" });
    }

    const direct = spawnSync("cl", compilerArgs, { stdio: "inherit" });
    if (direct.error?.code !== "ENOENT") return direct;

    const vcvars = findVisualStudioEnvironment();
    if (!vcvars) {
      return {
        error: new Error(
          "MSVC was not found. Install the Visual Studio C++ Build Tools or set CC to an MSVC-compatible compiler.",
        ),
        status: 1,
      };
    }
    const compileCommand = [
      "cl",
      ...compilerArgs.map(quoteForCommandPrompt),
    ].join(" ");
    const command = `call "${vcvars}" x64 >nul && ${compileCommand}`;
    // VsDevCmd.bat runs a bare `vswhere.exe` from its own directory. With
    // NoDefaultCurrentDirectoryInExePath set, cmd.exe will not resolve it and
    // prints a harmless but alarming "not recognized" error.
    const env = Object.fromEntries(
      Object.entries(process.env).filter(
        ([name]) => name.toLowerCase() !== "nodefaultcurrentdirectoryinexepath",
      ),
    );
    return spawnSync(command, {
      env,
      shell: process.env.ComSpec || "cmd.exe",
      stdio: "inherit",
    });
  } finally {
    rmSync(temporary, { force: true, recursive: true });
  }
}

function findVisualStudioEnvironment() {
  const programFilesX86 = process.env["ProgramFiles(x86)"];
  if (!programFilesX86) return null;
  const vswhere = resolve(
    programFilesX86,
    "Microsoft Visual Studio/Installer/vswhere.exe",
  );
  if (!existsSync(vswhere)) return null;
  const discovery = spawnSync(
    vswhere,
    [
      "-latest",
      "-products",
      "*",
      "-requires",
      "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
      "-property",
      "installationPath",
    ],
    { encoding: "utf8" },
  );
  const installation = discovery.stdout?.trim();
  if (discovery.status !== 0 || !installation) return null;
  const vcvars = resolve(installation, "VC/Auxiliary/Build/vcvars64.bat");
  return existsSync(vcvars) ? vcvars : null;
}

function quoteForCommandPrompt(value) {
  if (value.includes('"')) {
    throw new Error(`Cannot pass a path containing a quote to MSVC: ${value}`);
  }
  return `"${value}"`;
}
