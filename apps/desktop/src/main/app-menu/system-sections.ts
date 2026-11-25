import type { AppMenuContext, AppMenuItem } from "./types";

export function buildSettingsItem(context: AppMenuContext): AppMenuItem {
  return {
    label: "Settings",
    accelerator: context.accelerator("app.settings"),
    registerAccelerator: false,
    click: context.navTo("/settings"),
  };
}

export function buildApplicationSections(
  context: AppMenuContext,
  settingsItem: AppMenuItem,
): AppMenuItem[] {
  if (!context.isMac) return [];

  return [
    {
      label: context.appName,
      submenu: [
        {
          role: "about",
          label: `About ${context.appName}`,
        },
        { type: "separator" },
        {
          label: "Check for Updates",
          click: context.sendMenuAction("updates.check"),
        },
        { type: "separator" },
        settingsItem,
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
  ];
}

export function buildWindowSection(context: AppMenuContext): AppMenuItem {
  return {
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" },
      ...(!context.isMac ? ([{ role: "close" }] satisfies AppMenuItem[]) : []),
      { type: "separator" },
      {
        label: "Library Window",
        click: context.openLibraryWindow,
      },
      ...(context.isMac
        ? ([{ type: "separator" }, { role: "front" }] satisfies AppMenuItem[])
        : []),
    ],
  };
}

export function buildDeveloperSections(context: AppMenuContext): AppMenuItem[] {
  if (context.isPackaged) return [];

  return [
    {
      label: "Developer",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        {
          label: "Toggle React Scan",
          click: context.developer.toggleReactScan,
        },
      ],
    },
  ];
}

export function buildHelpSection(context: AppMenuContext): AppMenuItem {
  return {
    label: "Help",
    role: "help",
    submenu: [
      ...(!context.isMac
        ? ([
            {
              role: "about",
              label: `About ${context.appName}`,
            },
            { type: "separator" },
          ] satisfies AppMenuItem[])
        : []),
      {
        label: "Help Center",
        click: context.openExternalUrl(
          "https://github.com/raphaelsalaja/pond/wiki",
        ),
      },
      {
        label: "Keyboard Shortcuts",
        click: context.sendMenuAction("help.shortcuts"),
      },
      {
        label: "What's New",
        click: context.sendMenuAction("help.whats-new"),
      },
      { type: "separator" },
      {
        label: "Report an Issue",
        click: context.openExternalUrl(
          "https://github.com/raphaelsalaja/pond/issues",
        ),
      },
      {
        label: "Export Debug Report",
        click: context.sendMenuAction("help.export-debug-report"),
      },
      {
        label: context.isMac
          ? "Show Logs in Finder"
          : "Show Logs in File Explorer",
        click: context.showLogs,
      },
      { type: "separator" },
      {
        label: "Responsible Use",
        click: context.openExternalUrl(
          "https://pond.raphaelsalaja.com/responsible-use",
        ),
      },
    ],
  };
}
