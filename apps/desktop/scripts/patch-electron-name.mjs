#!/usr/bin/env node

/**
 * The Dock reads the .app bundle filename, so CFBundleName alone will not show "Pond" in dev.
 * @remarks Runs from postinstall because pnpm re-extracts Electron on install.
 */

import { spawnSync } from "node:child_process";
import { copyFile, readFile, rename, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const APP_NAME = "Pond";
const __dirname = import.meta.dirname;
const appRoot = resolve(__dirname, "..");
const electronPkg = resolve(appRoot, "node_modules/electron");
const distDir = resolve(electronPkg, "dist");
const pathTxt = resolve(electronPkg, "path.txt");
const electronApp = resolve(distDir, "Electron.app");
const pondApp = resolve(distDir, `${APP_NAME}.app`);
const pondIcnsPath = resolve(appRoot, "build/icon.icns");
const relativeBinary = `${APP_NAME}.app/Contents/MacOS/Electron`;

async function main() {
  if (process.platform !== "darwin") {
    return;
  }

  const appBundle = await ensureNamedBundle();
  if (!appBundle) {
    return;
  }

  const contents = resolve(appBundle, "Contents");
  await patchPlist(resolve(contents, "Info.plist"));
  await patchIcon(resolve(contents, "Resources/electron.icns"));
  await writePathTxt();
  refreshLaunchServices(appBundle);
}

/** Dock tooltip uses the .app filename; rename Electron.app → Pond.app. */
async function ensureNamedBundle() {
  if (await isDir(pondApp)) {
    return pondApp;
  }
  if (!(await isDir(electronApp))) {
    return null;
  }

  try {
    await rename(electronApp, pondApp);
    console.log(`[pond] renamed Electron.app → ${APP_NAME}.app`);
    return pondApp;
  } catch (error) {
    console.warn(
      `[pond] could not rename Electron.app (quit the running app, then: node apps/desktop/scripts/patch-electron-name.mjs): ${error.message}`,
    );
    return electronApp;
  }
}

async function writePathTxt() {
  if (!(await isDir(pondApp))) {
    return;
  }
  try {
    const current = (await readFile(pathTxt, "utf8")).trim();
    if (current === relativeBinary) {
      return;
    }
    await writeFile(pathTxt, relativeBinary, "utf8");
    console.log(`[pond] path.txt → ${relativeBinary}`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function patchPlist(plistPath) {
  let plist;
  try {
    plist = await readFile(plistPath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") {
      return;
    }
    throw error;
  }

  const patched = patch(
    patch(plist, "CFBundleName", APP_NAME),
    "CFBundleDisplayName",
    APP_NAME,
  );
  if (patched === plist) {
    console.log(`[pond] electron bundle already named "${APP_NAME}"`);
    return;
  }
  await writeFile(plistPath, patched, "utf8");
  console.log(`[pond] patched CFBundleName/DisplayName → "${APP_NAME}"`);
}

async function patchIcon(electronIcnsPath) {
  try {
    await copyFile(pondIcnsPath, electronIcnsPath);
    console.log(`[pond] patched dev Electron bundle icon → ${pondIcnsPath}`);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

/** Flush Finder/Dock's cached display name for the renamed bundle. */
function refreshLaunchServices(appBundle) {
  const lsregister =
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister";
  spawnSync(lsregister, ["-f", appBundle], { stdio: "ignore" });
}

function patch(plist, key, value) {
  const re = new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`, "g");
  return plist.replaceAll(re, `$1${value}$2`);
}

async function isDir(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function fail(error) {
  console.error("[pond] electron name patch failed:", error);
  process.exitCode = 1;
}

main().catch(fail);
