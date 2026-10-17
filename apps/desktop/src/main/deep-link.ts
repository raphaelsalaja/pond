import { app, type BrowserWindow, dialog } from "electron";
import log from "electron-log/main.js";
import { IPC } from "../shared/constants";
import { linkMatchesLibrary } from "../shared/library-links";
import { libraryId } from "./paths";

let pendingDeepLink: string | null = null;

export function deepLinkArg(argv: readonly string[]): string | null {
  return argv.find((arg) => arg.startsWith("pond://")) ?? null;
}

export function shouldOpenInitialWindow(
  launchedHidden: boolean,
  deepLinkDestination: "library" | undefined,
): boolean {
  return !launchedHidden || deepLinkDestination === "library";
}

export function consumePendingDeepLink(): string | null {
  const route = pendingDeepLink;
  pendingDeepLink = null;
  return route;
}

export function handleDeepLink(
  url: string,
  mainWindow: BrowserWindow | null,
): "library" | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "pond:") return;
    if (parsed.searchParams.has("library")) {
      if (!app.isReady()) {
        void app.whenReady().then(() => handleDeepLink(url, mainWindow));
        return;
      }
      if (!linkMatchesLibrary(parsed, libraryId())) {
        void dialog.showMessageBox({
          type: "info",
          title: "Open the linked library",
          message: "This link belongs to another Pond library.",
          detail:
            "Open its library from Recent Libraries, then open this link again. The current library has not changed.",
          buttons: ["OK"],
        });
        return;
      }
    }
    let route: string | null = null;
    if (parsed.hostname === "" || parsed.hostname === "library") {
      route = "/";
    } else if (parsed.hostname === "item") {
      const id = parsed.pathname.replace(/^\//, "");
      if (id) route = `/save/${encodeURIComponent(id)}`;
    } else if (parsed.hostname === "folder") {
      const id = parsed.pathname.replace(/^\//, "");
      if (id) route = `/?folder=${encodeURIComponent(id)}`;
    } else if (parsed.hostname === "view") {
      const id = parsed.pathname.replace(/^\//, "");
      if (id) route = `/?view=${encodeURIComponent(id)}`;
    } else if (parsed.hostname === "search") {
      const q = parsed.searchParams.get("q") ?? "";
      route = `/?q=${encodeURIComponent(q)}`;
    } else if (parsed.hostname === "capture") {
      const target = parsed.searchParams.get("url") ?? "";
      route = `/?capture=1${target ? `&url=${encodeURIComponent(target)}` : ""}`;
    } else if (parsed.hostname === "settings") {
      const sub = parsed.pathname.replace(/^\//, "").replace(/\/+$/, "");
      route = `/settings${sub ? `/${encodeURIComponent(sub)}` : ""}${parsed.hash}`;
    }
    if (!route) {
      log.info("[pond deep-link] ignored", url);
      return;
    }
    log.info("[pond deep-link] route", route);
    const target = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    // A window that is still loading cannot receive IPC; did-finish-load consumes the route.
    if (!target || target.webContents.isLoading()) {
      pendingDeepLink = route;
      return "library";
    }
    if (target.isMinimized()) target.restore();
    target.show();
    target.focus();
    target.webContents.send(IPC.nav, route);
    return "library";
  } catch (err) {
    log.warn("[pond deep-link] parse failed", url, err);
  }
}

type SecondInstanceDeps = {
  handleDeepLink: (
    url: string,
    mainWindow: BrowserWindow | null,
  ) => "library" | undefined;
  getMainWindow: () => BrowserWindow | null;
  openLibraryWindow: () => void | Promise<void>;
};

/** A second launch either carries a pond:// link or only asks to be shown. */
export function handleSecondInstance(
  argv: readonly string[],
  deps: SecondInstanceDeps,
): void {
  const url = deepLinkArg(argv);
  if (url) {
    const destination = deps.handleDeepLink(url, deps.getMainWindow());
    if (destination === "library") void deps.openLibraryWindow();
    return;
  }
  // openLibraryWindow also recreates a window the user closed.
  void deps.openLibraryWindow();
}
