import { clipboard, Menu, shell } from "electron";
import type {
  BrowserWindow,
  MenuItemConstructorOptions,
  WebContents,
} from "electron";
import log from "electron-log/main.js";
import { IPC } from "../../shared/constants";

function httpUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function attachGuestContextMenu(guest: WebContents): void {
  guest.on("context-menu", (_event, params) => {
    const template: Array<MenuItemConstructorOptions> = [];
    const link = httpUrl(params.linkURL);

    if (params.selectionText.trim().length > 0) {
      template.push({ role: "copy" });
    }
    if (link) {
      template.push({
        label: "Copy Link",
        click: () => {
          void clipboard
            .writeText(link)
            .catch((cause: unknown) =>
              log.warn("[pond archive] copy link failed", cause),
            );
        },
      });
    }
    if (params.mediaType === "image") {
      template.push({
        label: "Copy Image",
        click: () => guest.copyImageAt(params.x, params.y),
      });
    }
    if (link) {
      if (template.length > 0) {
        template.push({ type: "separator" });
      }
      template.push({
        label: "Open Link in Browser",
        click: () => void shell.openExternal(link),
      });
    }

    if (template.length > 0) {
      Menu.buildFromTemplate(template).popup();
    }
  });
}

export function hardenArchiveWebviews(win: BrowserWindow): void {
  win.webContents.on("will-attach-webview", (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    if (params.src && !params.src.startsWith("pond://")) {
      log.warn("[pond archive] blocked webview attach", params.src);
      event.preventDefault();
    }
  });

  win.webContents.on("did-attach-webview", (_event, guest) => {
    attachGuestContextMenu(guest);
    guest.setWindowOpenHandler(({ url }) => {
      forwardNavigation(win, guest.id, url);
      return { action: "deny" };
    });
    guest.on("will-navigate", (event, url) => {
      if (url.startsWith("pond://")) {
        return;
      }
      event.preventDefault();
      forwardNavigation(win, guest.id, url);
    });
  });
}

function forwardNavigation(
  win: BrowserWindow,
  guestId: number,
  url: string,
): void {
  if (win.isDestroyed()) {
    return;
  }
  win.webContents.send(IPC.archiveNavigate, { guestId, url });
}
