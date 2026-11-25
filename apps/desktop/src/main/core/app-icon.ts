import { existsSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { Prefs } from "@pond/schema/db";
import { app, nativeImage, systemPreferences } from "electron";
import type { NativeImage } from "electron";
import log from "electron-log/main.js";
import {
  DEFAULT_APP_ICON,
  pickIconGeneration,
  preferredAppIcon,
  resolveAppIconId,
  sortAppIconIds,
} from "../../shared/app-icons";
import { resolveMainOut } from "../lib/resolve-preload";
import { libraryRoot } from "../paths";
import { mainWindowState } from "../window-state";
import { createAppIconController } from "./app-icon-controller";
import { chooseAppIconSource } from "./app-icon-source";
import {
  appBundlePath,
  hasCustomBundleIcon,
  setBundleIcon,
} from "./bundle-icon";
import { macosMajor, watchIconStyle } from "./icon-style";
import type { IconStyleWatch } from "./icon-style";
import { readLibraryIdentity } from "./library-identity";
import { getPrefs } from "./prefs";

let legacyBundleIconCleared = false;
/** Shared with dock-tile/main.swift. */
const DOCK_TILE_LIGHT_KEY = "DockTileLightImage";
const DOCK_TILE_DARK_KEY = "DockTileDarkImage";
const DOCK_TILE_CHANGED = "so.pond.desktop.dockTileChanged";

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

/** Dock-ready tint images, written by scripts/prepare-dock-icons.mjs. */
function dockIconsRoot(): string {
  if (app.isPackaged) return join(process.resourcesPath, "dock-icons");
  const fromApp = join(app.getAppPath(), "build/dock-icons");
  if (existsSync(fromApp)) return fromApp;
  const fromOut = resolveMainOut("../../build/dock-icons");
  return existsSync(fromOut) ? fromOut : fromApp;
}

export function appIconFile(id: string): string | null {
  const path = join(tintsRoot(), id, "default.png");
  return existsSync(path) ? path : null;
}

/** A tint image for the Dock in the newest Icon Composer design generation this macOS supports. */
function styledIconFile(
  id: string,
  file: "default.png" | "dark.png",
): string | null {
  const tint = join(dockIconsRoot(), id);
  const generations = existsSync(tint)
    ? readdirSync(tint).flatMap((name) => {
        const match = name.match(/^macos-(\d+)$/);
        return match?.[1] ? [Number(match[1])] : [];
      })
    : [];
  const generation = pickIconGeneration(
    generations,
    macosMajor(process.platform, process.getSystemVersion()),
  );
  const candidates = [join(tint, file)];
  if (generation !== null) {
    candidates.unshift(join(tint, `macos-${generation}`, file));
  }
  return candidates.find((path) => existsSync(path)) ?? null;
}

function availableIds(): Array<string> {
  const root = tintsRoot();
  if (!existsSync(root)) {
    log.warn("[pond] app icon tints missing", root);
    return [];
  }
  const ids: Array<string> = [];
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

/** The packaged app's built-in icon is the Icon Composer catalog, which follows the icon style. */
function hasAdaptiveBuiltin(): boolean {
  return (
    app.isPackaged && existsSync(join(process.resourcesPath, "Assets.car"))
  );
}

const controller = createAppIconController({
  decide: (id, style) =>
    chooseAppIconSource({
      platform: process.platform,
      packaged: app.isPackaged,
      adaptiveBuiltin: hasAdaptiveBuiltin(),
      isDefault: id === DEFAULT_APP_ICON,
      style,
      lightImage: styledIconFile(id, "default.png") ?? "",
      darkImage: styledIconFile(id, "dark.png"),
    }),
  showImage(path) {
    const image = nativeImage.createFromPath(path);
    log.info("[pond] app icon", path);
    if (process.platform === "darwin") {
      app.dock?.setIcon(image);
      return;
    }
    const win = mainWindowState.current;
    if (win && !win.isDestroyed()) win.setIcon(image);
  },
  showBuiltin() {
    log.info("[pond] app icon", "built-in");
    restoreBuiltinDockIcon();
  },
  onError: (err) => log.warn("[pond] apply app icon failed", err),
});
let styleWatch: IconStyleWatch | null = null;
let styleKnown: Promise<void> | null = null;
/** How long a switch waits for the helper's first report before using the light image. */
const FIRST_STYLE_TIMEOUT_MS = 1000;

/**
 * Non-default colors depend on the icon style, so the watcher runs while one
 * is selected. A switch waits for its first report, so the light image never
 * shows on its way to a Dark or Clear one.
 */
function watchStyleWhileColored(): Promise<void> {
  if (styleKnown) return styleKnown;
  styleKnown = new Promise<void>((resolve) => {
    styleWatch = watchIconStyle((style) => {
      resolve();
      controller.setStyle(style);
    });
    if (!styleWatch) resolve();
    setTimeout(resolve, FIRST_STYLE_TIMEOUT_MS);
  });
  return styleKnown;
}

function stopStyleWatch(): void {
  styleWatch?.stop();
  styleWatch = null;
  styleKnown = null;
}

/** Counts icon switches, so one still waiting on the icon style yields to a later one. */
let latestSwitch = 0;

export async function applyAppIcon(id?: string): Promise<void> {
  const ticket = ++latestSwitch;
  const prefs = id === undefined ? await getPrefs().catch(() => null) : null;
  if (ticket !== latestSwitch) {
    return;
  }
  const resolved = resolveAppIconId(
    id ?? prefs?.window.appIcon ?? DEFAULT_APP_ICON,
    new Set(availableIds()),
  );
  if (!appIconFile(resolved)) {
    log.warn("[pond] app icon file missing", id);
    return;
  }
  if (resolved === DEFAULT_APP_ICON) {
    controller.select(resolved);
    stopStyleWatch();
  } else {
    await watchStyleWhileColored();
    if (ticket !== latestSwitch) return;
    controller.select(resolved);
  }
  publishDockTile(resolved);
  await clearLegacyBundleIcon();
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

/** Electron's macOS Dock.setIcon passes null through as a nil NSApplication icon, which restores the bundle icon; its typings list only images. */
interface ResettableDock {
  setIcon(image: NativeImage | string | null): void;
}

function restoreBuiltinDockIcon(): void {
  const dock: ResettableDock | undefined = app.dock;
  if (!dock) {
    return;
  }
  dock.setIcon(null);
}

/**
 * Pond once wrote the selected color onto Pond.app as a custom Finder icon. The
 * Dock tile plug-in draws colors now, and a custom icon would hide the built-in
 * one, so clear any that is left.
 */
async function clearLegacyBundleIcon(): Promise<void> {
  if (legacyBundleIconCleared) return;
  legacyBundleIconCleared = true;
  const bundle = appBundlePath({
    platform: process.platform,
    packaged: app.isPackaged,
    exePath: app.getPath("exe"),
  });
  if (!bundle || !hasCustomBundleIcon(bundle)) {
    return;
  }
  await setBundleIcon(bundle, null).catch((cause: unknown) =>
    log.warn("[pond] reset bundle icon failed", cause),
  );
}

/**
 * Tells the Dock tile plug-in (dock-tile/main.swift) which images to draw while
 * Pond is not running, relative to Contents/Resources so moving Pond.app keeps
 * them valid. It picks between them by icon style, so they change only with the
 * selected color.
 */
function publishDockTile(id: string): void {
  if (process.platform !== "darwin" || !app.isPackaged) return;
  const light =
    id === DEFAULT_APP_ICON ? null : styledIconFile(id, "default.png");
  const dark = id === DEFAULT_APP_ICON ? null : styledIconFile(id, "dark.png");
  for (const [key, path] of [
    [DOCK_TILE_LIGHT_KEY, light],
    [DOCK_TILE_DARK_KEY, dark ?? light],
  ] as const) {
    if (path) {
      systemPreferences.setUserDefault(
        key,
        "string",
        relative(process.resourcesPath, path),
      );
    } else {
      systemPreferences.removeUserDefault(key);
    }
  }
  systemPreferences.postNotification(DOCK_TILE_CHANGED, {}, true);
}
