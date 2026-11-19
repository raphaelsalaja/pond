import { once } from "node:events";
import type { AppNavigation } from "../shared/app-navigation";
import { IPC } from "../shared/constants";
import { handleDeepLink } from "./deep-link";
import { getMainWindow, openLibraryWindow } from "./window";

export async function navigateApp(target: AppNavigation): Promise<void> {
  if (target.kind === "save") {
    handleDeepLink(
      `pond://item/${encodeURIComponent(target.id)}`,
      getMainWindow(),
    );
    await openLibraryWindow();
    return;
  }
  await openLibraryWindow();
  const win = getMainWindow();
  if (!win || win.isDestroyed()) return;
  if (win.webContents.isLoading()) {
    await once(win.webContents, "did-finish-load");
  }
  win.webContents.send(IPC.agentFilter, target.query);
}
