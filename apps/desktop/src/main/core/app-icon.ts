import { existsSync, readdirSync } from "node:fs";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Prefs } from "@pond/schema/db";
import { app, type NativeImage, nativeImage } from "electron";
import log from "electron-log/main.js";
import sharp from "sharp";
import {
  DEFAULT_APP_ICON,
  preferredAppIcon,
  resolveAppIconId,
  sortAppIconIds,
} from "../../shared/app-icons";
import { resolveMainOut } from "../lib/resolve-preload";
import { libraryRoot } from "../paths";
import { mainWindowState } from "../window-state";
import {
  appBundlePath,
  hasCustomBundleIcon,
  setBundleIcon,
} from "./bundle-icon";
import { readLibraryIdentity } from "./library-identity";
import { getPrefs } from "./prefs";

const DOCK_CONTENT_SCALE = 0.8;

let lastAppliedPath: string | null = null;
let bundleIconQueue: Promise<void> = Promise.resolve();
let bundleIconChecked = false;

function tintsRoot(): string {
  if (app.isPackaged) return join(process.resourcesPath, "app-icons");
  const packagedDev = join(
    app.getAppPath(),
    "../../packages/icons/brand/tints",
  );
  if (existsSync(packagedDev)) return packagedDev;
  const fromOut = resolveMainOut("../../../../packages/icons/brand/tints");
  return existsSync(fromOut) ? fromOut : packagedDev;
}

export function appIconFile(id: string): string | null {
  const path = join(tintsRoot(), id, "default.png");
  return existsSync(path) ? path : null;
}

function availableIds(): string[] {
  const root = tintsRoot();
  if (!existsSync(root)) {
    log.warn("[pond] app icon tints missing", root);
    return [];
  }
  const ids: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    if (appIconFile(entry.name)) ids.push(entry.name);
  }
  return sortAppIconIds(ids);
}

export function resolveAppIconPath(id: string): string | null {
  const available = new Set(availableIds());
  const resolved = resolveAppIconId(id, available);
  return appIconFile(resolved);
}

async function insetIcon(
  path: string,
  contentScale: number,
  canvas: number,
): Promise<NativeImage> {
  const contentSize = Math.max(1, Math.round(canvas * contentScale));
  const offset = Math.round((canvas - contentSize) / 2);
  const content = await sharp(path)
    .ensureAlpha()
    .resize(contentSize, contentSize)
    .png()
    .toBuffer();
  const buf = await sharp({
    create: {
      width: canvas,
      height: canvas,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: content, left: offset, top: offset }])
    .png()
    .toBuffer();
  return nativeImage.createFromBuffer(buf);
}

/** Rendered on demand: each 1024 px tint decodes to megabytes, and only the applied one is ever shown. */
async function dockImage(path: string): Promise<NativeImage> {
  const meta = await sharp(path).metadata();
  return insetIcon(path, DOCK_CONTENT_SCALE, meta.width ?? 1024);
}

export async function applyAppIcon(id?: string): Promise<void> {
  const prefs = id == null ? await getPrefs().catch(() => null) : null;
  const path = resolveAppIconPath(
    id ?? prefs?.window.appIcon ?? DEFAULT_APP_ICON,
  );
  if (!path) {
    log.warn("[pond] app icon file missing", id);
    return;
  }
  if (path === lastAppliedPath) return;
  lastAppliedPath = path;
  try {
    const image = await dockImage(path);
    if (process.platform !== "darwin") {
      const win = mainWindowState.current;
      if (win && !win.isDestroyed()) win.setIcon(image);
    } else {
      app.dock?.setIcon(image);
      bundleIconQueue = bundleIconQueue.then(() =>
        applyBundleIcon(path, image),
      );
    }
  } catch (err) {
    log.warn("[pond] apply app icon failed", err);
  }
}

export async function applyPreferredAppIcon(
  windowPrefs?: Prefs["window"],
): Promise<void> {
  const prefs = windowPrefs ?? (await getPrefs().catch(() => null))?.window;
  if (!prefs) {
    await applyAppIcon(DEFAULT_APP_ICON);
    return;
  }
  const logo = prefs.appIconMatchesLibrary ? await openLibraryLogo() : null;
  await applyAppIcon(preferredAppIcon(prefs, logo));
}

async function openLibraryLogo() {
  try {
    return await readLibraryIdentity(libraryRoot());
  } catch {
    return null;
  }
}

async function applyBundleIcon(
  path: string,
  image: NativeImage,
): Promise<void> {
  const bundle = appBundlePath({
    platform: process.platform,
    packaged: app.isPackaged,
    exePath: app.getPath("exe"),
  });
  if (!bundle) return;
  const launching = !bundleIconChecked;
  bundleIconChecked = true;
  if (path === appIconFile(DEFAULT_APP_ICON)) {
    await setBundleIcon(bundle, null).catch((err) =>
      log.warn("[pond] reset bundle icon failed", err),
    );
    return;
  }
  if (launching && hasCustomBundleIcon(bundle)) return;
  const imagePath = join(app.getPath("temp"), "pond-bundle-icon.png");
  try {
    await writeFile(imagePath, image.toPNG());
    await setBundleIcon(bundle, imagePath);
  } catch (err) {
    log.warn("[pond] set bundle icon failed", err);
  } finally {
    await rm(imagePath, { force: true }).catch(() => undefined);
  }
}
