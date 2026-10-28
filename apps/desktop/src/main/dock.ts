import { app } from "electron";
import { getPrefs } from "./core/prefs";
import { openPreviewWindowCount } from "./core/preview-windows";
import { shouldShowDock } from "./lifecycle";
import { mainWindowState } from "./window-state";

/** `dock.show()` hands focus to the Dock and back even when the icon is already there. */
export async function showDock(): Promise<void> {
  if (process.platform !== "darwin" || !app.dock || app.dock.isVisible())
    return;
  await app.dock.show();
}

/** Hidden helper windows keep `window-all-closed` from firing, so each close settles the Dock. */
export async function settleDockAfterClose(): Promise<void> {
  if (process.platform !== "darwin" || !app.dock?.isVisible()) return;
  const { system } = await getPrefs();
  const library = mainWindowState.current;
  const libraryOpen =
    library !== null &&
    !library.isDestroyed() &&
    (library.isVisible() || library.isMinimized());
  const openWindows = openPreviewWindowCount() + (libraryOpen ? 1 : 0);
  if (shouldShowDock({ visibility: system.dockVisibility, openWindows }))
    return;
  app.dock.hide();
}
