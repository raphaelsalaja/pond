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
          click: context.navTo("/settings/general"),
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
      { role: "close" },
      { role: "togglefullscreen" },
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
          "https://github.com/raphaelsalaja/pond#readme",
        ),
      },
      {
        label: "Responsible Use",
        click: context.openExternalUrl(
          "https://github.com/raphaelsalaja/pond/blob/main/RESPONSIBLE-USE.md",
        ),
      },
      {
        label: "Keyboard Shortcuts",
        click: context.sendMenuAction("help.shortcuts"),
      },
      {
        label: "Export Debug Report",
        click: context.sendMenuAction("help.export-debug-report"),
      },
      { type: "separator" },
      {
        label: "Report an Issue",
        click: context.openExternalUrl(
          "https://github.com/raphaelsalaja/pond/issues",
        ),
      },
      {
        label: "Release Notes",
        click: context.openExternalUrl(
          "https://github.com/raphaelsalaja/pond/releases",
        ),
      },
      {
        label: "Email",
        click: context.openExternalUrl("mailto:raphaelsalaja@gmail.com"),
      },
      {
        label: "Buy Me a Coffee",
        click: context.openExternalUrl(
          "https://buymeacoffee.com/raphaelsalaja",
        ),
      },
      { type: "separator" },
      {
        label: context.isMac
          ? "Show Logs in Finder"
          : "Show Logs in File Explorer",
        click: context.showLogs,
      },
    ],
  };
}
