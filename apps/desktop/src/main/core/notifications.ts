import type { Save, SyncAction } from "@pond/schema/db";
import { BrowserWindow, Notification } from "electron";
import log from "electron-log/main.js";
import { IPC } from "../../shared/constants";
import { registerSyncActionListener } from "./executor";
import { getPrefs } from "./prefs";
import { sourceLabel } from "./refresh/sources";

/**
 * Native OS notification side of the "Save Completed" feature. The
 * in-app toast counterpart lives in
 * `renderer/src/effects/save-complete-toast.tsx`. They split on focus:
 * if any pond window is focused at the moment the save lands, we let
 * the renderer paint a toast; if not (the common case for a Twitter
 * bookmark in the browser), we fire a system notification so the user
 * knows the save actually made it through.
 *
 * Both sides gate on the same `prefs.notifications.saveComplete`
 * toggle exposed by Settings → Notifications.
 */
export interface SaveCompleteNotifierOptions {
  /**
   * Focus + raise the main pond window so the click handler can route
   * the user to the freshly-saved item. Mirrors the tray menu's
   * `openLibrary` behaviour — see `apps/desktop/src/main/index.ts`.
   */
  focusMainWindow: () => Promise<BrowserWindow | null> | BrowserWindow | null;
}

let started = false;

export function startSaveCompleteNotifier(
  opts: SaveCompleteNotifierOptions,
): void {
  if (started) return;
  started = true;

  registerSyncActionListener((action) => {
    void handleAction(action, opts).catch((err) => {
      log.warn("[pond notifications] handler threw", err);
    });
  });
}

async function handleAction(
  action: SyncAction,
  opts: SaveCompleteNotifierOptions,
): Promise<void> {
  if (action.modelName !== "save" || action.action !== "I") return;

  const save = action.data as Partial<Save> | null;
  if (!save?.id || !save.source) return;

  if (!Notification.isSupported()) return;

  const focused = BrowserWindow.getFocusedWindow();
  if (focused && !focused.isDestroyed() && focused.isVisible()) {
    // Renderer's toast handles this case.
    return;
  }

  const prefs = await getPrefs();
  if (!prefs.notifications.saveComplete) return;

  const title = `Saved from ${sourceLabel(save.source)}`;
  const body = pickBody(save);

  const notification = new Notification({
    title,
    body,
    silent: !prefs.notifications.sound,
  });

  const route = `/save/${encodeURIComponent(save.id)}`;
  notification.on("click", () => {
    void (async () => {
      try {
        const win = await opts.focusMainWindow();
        if (!win || win.isDestroyed()) return;
        win.webContents.send(IPC.nav, route);
      } catch (err) {
        log.warn("[pond notifications] click handler failed", err);
      }
    })();
  });

  notification.show();
}

function pickBody(save: Partial<Save>): string {
  const title = trim(save.title);
  if (title) return title;
  const description = trim(save.description);
  if (description) return description;
  const host = hostFromUrl(save.url);
  if (host) return host;
  return "Tap to open in pond.";
}

function trim(value: string | null | undefined): string | null {
  if (!value) return null;
  const collapsed = value.replace(/\s+/g, " ").trim();
  if (!collapsed) return null;
  return collapsed.length > 140 ? `${collapsed.slice(0, 137)}…` : collapsed;
}

function hostFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
