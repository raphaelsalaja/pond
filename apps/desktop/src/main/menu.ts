import { SOURCES, sourceLabel } from "@pond/schema";
import { app, BrowserWindow, Menu, shell } from "electron";
import log from "electron-log/main.js";
import {
  IPC,
  type MenuActionId,
  type RecentMenuEntry,
} from "../shared/constants";
import { reconcileLibrary } from "./core/scan";
import { syncAllSources, syncSource } from "./core/sync";
import { libraryRoot } from "./paths";

interface AppMenuDeps {
  focusedOrMain: () => BrowserWindow | null;
  openLibraryWindow: () => void;
}

/** How many recently-visited saves to surface in the History menu. */
const RECENTS_MENU_CAP = 12;

/** Kept at module scope so `setMenuRecents` can rebuild the menu in place without the caller re-threading its dependencies. */
let activeDeps: AppMenuDeps | null = null;
let recentEntries: RecentMenuEntry[] = [];

/** Replaces the History menu's recents from the renderer and rebuilds in place. */
export function setMenuRecents(entries: RecentMenuEntry[]): void {
  recentEntries = entries.slice(0, RECENTS_MENU_CAP);
  if (activeDeps) buildAndSetMenu(activeDeps);
}

export function installAppMenu(deps: AppMenuDeps): void {
  activeDeps = deps;
  buildAndSetMenu(deps);
}

function buildAndSetMenu(deps: AppMenuDeps): void {
  const { focusedOrMain, openLibraryWindow } = deps;
  const isMac = process.platform === "darwin";

  const navTo = (path: string) => () => {
    const target = focusedOrMain();
    target?.webContents.send(IPC.nav, path);
  };

  const sendMenuAction = (id: MenuActionId) => () => {
    const target = focusedOrMain();
    target?.webContents.send(IPC.menuAction, id);
  };

  const openExternalUrl = (url: string) => () => {
    void shell.openExternal(url);
  };

  const openRecent = (id: string) => () => {
    focusedOrMain()?.webContents.send(IPC.menuOpenSave, id);
  };

  const recentsItems = (): Electron.MenuItemConstructorOptions[] => {
    if (recentEntries.length === 0) {
      return [{ label: "No Recent Items", enabled: false }];
    }
    return recentEntries.map((entry) => ({
      label: entry.title,
      click: openRecent(entry.id),
    }));
  };

  const sourcesSubmenu = (): Electron.MenuItemConstructorOptions[] => {
    const syncItems: Electron.MenuItemConstructorOptions[] = SOURCES.filter(
      /** Local imports have no remote to sync from. */
      (source) => source !== "local",
    ).map((source) => ({
      label: `Sync ${sourceLabel(source)}`,
      click: () => {
        void syncSource(source, { trigger: "manual" }).catch((err) =>
          log.warn(`[pond menu] sync ${source} failed`, err),
        );
      },
    }));
    return [
      {
        label: "Sync All Sources",
        click: () => void syncAllSources({ trigger: "manual" }),
      },
      ...syncItems,
      { type: "separator" },
      {
        label: "Refresh All Metadata",
        click: sendMenuAction("refresh.all"),
      },
      {
        label: "Cancel Metadata Refresh",
        click: sendMenuAction("refresh.cancel"),
      },
    ];
  };

  const settingsItem: Electron.MenuItemConstructorOptions = {
    label: "Settings",
    accelerator: "CmdOrCtrl+,",
    click: navTo("/settings"),
  };

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" as const, label: `About ${app.name}` },
              { type: "separator" as const },
              {
                label: "Check for Updates",
                click: navTo("/settings/general"),
              },
              { type: "separator" as const },
              settingsItem,
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          } satisfies Electron.MenuItemConstructorOptions,
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Tab",
          accelerator: "CmdOrCtrl+T",
          click: () => {
            focusedOrMain()?.webContents.send(IPC.tabNew);
          },
        },
        {
          label: "Close Tab",
          accelerator: "CmdOrCtrl+W",
          click: () => {
            focusedOrMain()?.webContents.send(IPC.tabClose);
          },
        },
        {
          label: "Reopen Closed Tab",
          accelerator: "CmdOrCtrl+Shift+T",
          click: () => {
            focusedOrMain()?.webContents.send(IPC.tabReopen);
          },
        },
        {
          label: "Open Library",
          click: () => openLibraryWindow(),
        },
        { type: "separator" },
        {
          label: "Open with Default App",
          /** Display-only: the renderer's save hotkeys own the key so it stays scoped to a selected save. */
          accelerator: "O",
          registerAccelerator: false,
          click: sendMenuAction("save.open-with-default"),
        },
        {
          label: "Open Original URL",
          click: sendMenuAction("save.open-original"),
        },
        {
          label: "Reveal in Finder",
          click: sendMenuAction("save.reveal"),
        },
        { type: "separator" },
        {
          label: "Rename",
          click: sendMenuAction("save.rename"),
        },
        {
          label: "Add Tag",
          click: sendMenuAction("save.add-tag"),
        },
        {
          label: "Refresh Details",
          accelerator: "R",
          registerAccelerator: false,
          click: sendMenuAction("save.refresh"),
        },
        { type: "separator" },
        {
          label: "Move to Trash",
          accelerator: "Backspace",
          registerAccelerator: false,
          click: sendMenuAction("save.trash"),
        },
        {
          label: "Restore from Trash",
          click: sendMenuAction("save.untrash"),
        },
        {
          label: "Delete Forever",
          accelerator: "CmdOrCtrl+Backspace",
          registerAccelerator: false,
          click: sendMenuAction("save.delete-forever"),
        },
        { type: "separator" },
        isMac ? { role: "close" } : { role: "quit" },
      ],
    },
    {
      label: "Edit",
      submenu: [
        {
          label: "Undo",
          accelerator: "CmdOrCtrl+Z",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (!win || win.isDestroyed()) return;
            win.webContents.undo();
            win.webContents.send(IPC.editUndoRequested);
          },
        },
        {
          label: "Redo",
          accelerator: "CmdOrCtrl+Shift+Z",
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (!win || win.isDestroyed()) return;
            win.webContents.redo();
            win.webContents.send(IPC.editRedoRequested);
          },
        },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
        { type: "separator" },
        {
          label: "Copy Image or Video",
          accelerator: "C",
          registerAccelerator: false,
          click: sendMenuAction("save.copy-media"),
        },
        {
          label: "Copy URL",
          accelerator: "CmdOrCtrl+Shift+C",
          registerAccelerator: false,
          click: sendMenuAction("save.copy-url"),
        },
        {
          label: "Copy Save ID",
          click: sendMenuAction("save.copy-id"),
        },
        { type: "separator" },
        {
          label: "Move Selected to Trash",
          click: sendMenuAction("save.bulk-trash"),
        },
        {
          label: "Refresh Selected",
          click: sendMenuAction("save.bulk-refresh"),
        },
        ...(!isMac ? [{ type: "separator" as const }, settingsItem] : []),
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Cycle Layout",
          accelerator: "CmdOrCtrl+Shift+L",
          click: sendMenuAction("view.layout.cycle"),
        },
        {
          label: "Waterfall",
          click: sendMenuAction("view.layout.waterfall"),
        },
        { label: "Grid", click: sendMenuAction("view.layout.grid") },
        {
          label: "Justified",
          click: sendMenuAction("view.layout.justified"),
        },
        { label: "List", click: sendMenuAction("view.layout.list") },
        { type: "separator" },
        {
          label: "Toggle Details",
          accelerator: "CmdOrCtrl+I",
          click: sendMenuAction("view.inspector.toggle"),
        },
        {
          label: "Appearance",
          submenu: [
            { label: "Light", click: sendMenuAction("theme.light") },
            { label: "Dark", click: sendMenuAction("theme.dark") },
            { label: "Match System", click: sendMenuAction("theme.system") },
          ],
        },
        { type: "separator" },
        /** Grid zoom, not page zoom: the roles would scale the whole chrome. */
        {
          label: "Zoom In",
          accelerator: "CmdOrCtrl+=",
          click: sendMenuAction("view.zoom-in"),
        },
        {
          label: "Zoom Out",
          accelerator: "CmdOrCtrl+-",
          click: sendMenuAction("view.zoom-out"),
        },
        {
          label: "Reset Zoom",
          accelerator: "CmdOrCtrl+0",
          click: sendMenuAction("view.zoom-reset"),
        },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Go",
      submenu: [
        {
          label: "Back",
          accelerator: "CmdOrCtrl+[",
          click: sendMenuAction("history.back"),
        },
        {
          label: "Forward",
          accelerator: "CmdOrCtrl+]",
          click: sendMenuAction("history.forward"),
        },
        { type: "separator" },
        { label: "Library", accelerator: "CmdOrCtrl+1", click: navTo("/") },
        {
          label: "Sources",
          accelerator: "CmdOrCtrl+2",
          click: navTo("/sources"),
        },
        {
          label: "Analytics",
          accelerator: "CmdOrCtrl+3",
          click: navTo("/analytics"),
        },
        { label: "Trash", accelerator: "CmdOrCtrl+4", click: navTo("/trash") },
        { type: "separator" },
        {
          label: "Ask Your Library",
          /** Display-only: the renderer owns the key so it works while a field is focused. */
          accelerator: "CmdOrCtrl+K",
          registerAccelerator: false,
          click: sendMenuAction("dock.ask"),
        },
        {
          label: "Search",
          accelerator: "CmdOrCtrl+F",
          registerAccelerator: false,
          click: sendMenuAction("dock.search"),
        },
      ],
    },
    {
      label: "History",
      submenu: recentsItems(),
    },
    {
      label: "Library",
      submenu: [
        {
          label: "Reveal Library in Finder",
          click: () => void shell.openPath(libraryRoot()),
        },
        {
          label: "Move Library",
          click: sendMenuAction("library.move"),
        },
        { type: "separator" },
        {
          label: "Rescan Library",
          click: () =>
            void reconcileLibrary().catch((err) =>
              log.warn("[pond menu] rescan failed", err),
            ),
        },
        {
          label: "Verify Integrity",
          click: async () => {
            try {
              const { verifyLibraryIntegrity } = await import(
                "./core/library-ops"
              );
              await verifyLibraryIntegrity();
            } catch (err) {
              log.warn("[pond menu] verify failed", err);
            }
          },
        },
        { type: "separator" },
        {
          label: "Sync",
          submenu: sourcesSubmenu(),
        },
        { type: "separator" },
        {
          label: "Empty Trash",
          accelerator: "CmdOrCtrl+Shift+Backspace",
          click: sendMenuAction("trash.empty"),
        },
        {
          label: "Restore All from Trash",
          click: sendMenuAction("trash.restore-all"),
        },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        ...(isMac
          ? ([
              { type: "separator" },
              { role: "front" },
            ] satisfies Electron.MenuItemConstructorOptions[])
          : ([
              { role: "close" },
            ] satisfies Electron.MenuItemConstructorOptions[])),
      ],
    },
    ...(!app.isPackaged
      ? ([
          {
            label: "Developer",
            submenu: [
              { role: "reload" as const },
              { role: "forceReload" as const },
              { role: "toggleDevTools" as const },
              { type: "separator" as const },
              {
                label: "Restart Local API",
                click: sendMenuAction("developer.restart-api"),
              },
              {
                label: "Open Developer Logs",
                click: sendMenuAction("developer.open-logs"),
              },
              {
                label: "Open IPC Inspector",
                click: sendMenuAction("developer.ipc-inspector"),
              },
            ],
          },
        ] satisfies Electron.MenuItemConstructorOptions[])
      : []),
    {
      label: "Help",
      role: "help",
      submenu: [
        {
          label: "Keyboard Shortcuts",
          accelerator: "CmdOrCtrl+/",
          click: sendMenuAction("help.shortcuts"),
        },
        { type: "separator" },
        {
          label: "Pond on GitHub",
          click: openExternalUrl("https://github.com/raphaelsalaja/pond"),
        },
        {
          label: "Report an Issue",
          click: openExternalUrl(
            "https://github.com/raphaelsalaja/pond/issues/new",
          ),
        },
        { type: "separator" },
        {
          label: "Show Logs in Finder",
          click: () => void shell.openPath(app.getPath("logs")),
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
