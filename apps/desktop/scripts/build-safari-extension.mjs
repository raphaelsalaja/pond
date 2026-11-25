#!/usr/bin/env node
/**
 * Compiles the Safari App Extension into `resources/SafariExtension`, which
 * electron-builder copies to Contents/PlugIns. Safari cannot launch an external
 * native-messaging host, so the handler has to ship inside Pond.app.
 *
 * The appex is signed here ad hoc with its own entitlements; `sign-mac.cjs` re-signs it
 * with the release identity, because electron-builder never signs Contents/PlugIns.
 * It also builds `safari-settings.node` and `app-group.node`, which electron-builder
 * copies to Contents/Resources and signs with the rest of the app.
 *
 * Skipped outside macOS. Without Xcode it skips locally and fails in CI, so a release
 * cannot ship without Safari.
 */

import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import nodeApiHeaders from "node-api-headers";

const desktopRoot = resolve(import.meta.dirname, "..");
const extensionRoot = resolve(desktopRoot, "../extension");
const workDir = resolve(desktopRoot, ".safari-build");
const outDir = resolve(desktopRoot, "resources/SafariExtension");
const entitlements = resolve(extensionRoot, "safari/extension.entitlements");

/** Safari 18 is the first to honor `world: "MAIN"`, and it runs on macOS 13.5 and later. */
const DEPLOYMENT_TARGET = "13.5";

/** The appex must carry the host app's bundle ID as its prefix, so read it from `appId`. */
function appBundleId() {
  const yml = readFileSync(
    resolve(desktopRoot, "electron-builder.yml"),
    "utf8",
  );
  const match = yml.match(/^appId:\s*(\S+)\s*$/m);
  if (!match) fail("electron-builder.yml has no top-level appId");
  return match[1];
}

function skip(reason) {
  console.log(`[pond safari] skipped: ${reason}`);
  process.exit(0);
}

function fail(message) {
  console.error(`[pond safari] ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error || result.status !== 0) {
    fail(`${command} ${args.join(" ")} failed`);
  }
}

if (process.platform !== "darwin") skip("Safari is macOS only");

const xcode = spawnSync("xcrun", ["--find", "xcodebuild"], {
  encoding: "utf8",
});
if (xcode.error || xcode.status !== 0) {
  if (process.env.CI) fail("Xcode is required to build the Safari extension");
  skip("Xcode is not installed");
}

run("pnpm", ["exec", "wxt", "build", "-b", "safari", "--mv3"], {
  cwd: extensionRoot,
});

/** The converter needs a clean directory. */
rmSync(workDir, { recursive: true, force: true });
mkdirSync(workDir, { recursive: true });
run("xcrun", [
  "safari-web-extension-converter",
  resolve(extensionRoot, ".output/safari-mv3"),
  "--project-location",
  workDir,
  "--app-name",
  "Pond",
  "--bundle-identifier",
  appBundleId(),
  "--swift",
  "--macos-only",
  "--no-open",
  "--no-prompt",
]);

const projectRoot = join(workDir, "Pond");
const extensionSource = join(
  projectRoot,
  "Pond Extension/SafariWebExtensionHandler.swift",
);
if (!existsSync(extensionSource)) {
  fail("the converter did not produce an extension target");
}

cpSync(
  resolve(extensionRoot, "safari/SafariWebExtensionHandler.swift"),
  extensionSource,
);

/**
 * Only the extension target builds: the converter's wrapper app is discarded, and its ID
 * (`so.pond.Pond`) would fail the embedded-binary prefix check. The deployment target is
 * pinned because the converter derives it from the installed Xcode.
 */
run("xcodebuild", [
  "-project",
  join(projectRoot, "Pond.xcodeproj"),
  "-target",
  "Pond Extension",
  "-configuration",
  "Release",
  `SYMROOT=${join(workDir, "build")}`,
  `MACOSX_DEPLOYMENT_TARGET=${DEPLOYMENT_TARGET}`,
  "CODE_SIGNING_ALLOWED=NO",
  "build",
]);

const builtAppex = join(workDir, "build/Release/Pond Extension.appex");
if (!existsSync(builtAppex)) fail("the .appex was not produced");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const appex = join(outDir, "Pond Extension.appex");
cpSync(builtAppex, appex, { recursive: true });

run("codesign", [
  "--force",
  "--sign",
  "-",
  "--options",
  "runtime",
  "--entitlements",
  entitlements,
  appex,
]);

/**
 * Compiles `safari/<name>.m` into a Node-API module that Electron's main process loads.
 * Node-API is ABI-stable, so Node's headers build a module Electron can load.
 */
function buildModule(name, frameworks) {
  const out = join(outDir, `${name}.node`);
  run("xcrun", [
    "--sdk",
    "macosx",
    "clang",
    "-O2",
    "-fobjc-arc",
    "-bundle",
    "-undefined",
    "dynamic_lookup",
    "-arch",
    "arm64",
    "-arch",
    "x86_64",
    `-mmacosx-version-min=${DEPLOYMENT_TARGET}`,
    "-I",
    nodeApiHeaders.include_dir,
    ...frameworks.flatMap((framework) => ["-framework", framework]),
    "-o",
    out,
    resolve(extensionRoot, `safari/${name}.m`),
  ]);
  run("codesign", ["--force", "--sign", "-", out]);
  return out;
}

/**
 * Safari has no URL scheme for its Extensions pane, and it answers SFSafariApplication only
 * for the main process of the app that holds the extension, so Electron loads this module
 * instead of spawning a helper.
 */
const settings = buildModule("safari-settings", [
  "Foundation",
  "SafariServices",
]);
/** macOS only lets Pond into its app group container once Pond asks containermanagerd. */
const appGroup = buildModule("app-group", ["Foundation"]);

console.log(`[pond safari] extension bundled at ${appex}`);
console.log(`[pond safari] settings module at ${settings}`);
console.log(`[pond safari] app group module at ${appGroup}`);
