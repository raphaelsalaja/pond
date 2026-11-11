import type { BrowserWindow } from "electron";
import type { RecentMenuEntry } from "../shared/constants";
import type { ShortcutPreferences } from "../shared/shortcuts";
import { applyAppMenu } from "./app-menu";
import { subscribePrefs } from "./core/prefs";
import { disableMenuActionImages } from "./lib/menu-action-images";

interface AppMenuDeps {
  focusedOrMain: () => BrowserWindow | null;
  openLibraryWindow: () => Promise<void>;
  shortcuts: ShortcutPreferences;
}

const RECENTS_MENU_CAP = 12;

let activeDeps: AppMenuDeps | null = null;
let recentEntries: RecentMenuEntry[] = [];
let unsubscribePrefs: (() => void) | undefined;

export function setMenuRecents(entries: RecentMenuEntry[]): void {
  recentEntries = entries.slice(0, RECENTS_MENU_CAP);
  if (activeDeps) buildAndSetMenu(activeDeps);
}

export function installAppMenu(deps: AppMenuDeps): void {
  disableMenuActionImages();
  activeDeps = deps;
  unsubscribePrefs?.();
  let menuKey = JSON.stringify(deps.shortcuts);
  unsubscribePrefs = subscribePrefs((prefs) => {
    if (!activeDeps) return;
    const nextKey = JSON.stringify(prefs.shortcuts);
    if (nextKey === menuKey) return;
    menuKey = nextKey;
    activeDeps = {
      ...activeDeps,
      shortcuts: prefs.shortcuts,
    };
    buildAndSetMenu(activeDeps);
  });
  buildAndSetMenu(deps);
}

function buildAndSetMenu(deps: AppMenuDeps): void {
  applyAppMenu(deps, recentEntries);
}
