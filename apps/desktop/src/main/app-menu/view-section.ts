import type { AppMenuContext, AppMenuItem } from "./types";

export function buildViewSection(context: AppMenuContext): AppMenuItem {
  const { accelerator, sendMenuAction } = context;

  return {
    label: "View",
    submenu: [
      {
        label: "All Saves",
        accelerator: accelerator("nav.library"),
        registerAccelerator: false,
        click: sendMenuAction("nav.library"),
      },
      {
        label: "Tags",
        click: sendMenuAction("nav.tags"),
      },
      {
        label: "Uncategorized",
        click: sendMenuAction("nav.uncategorized"),
      },
      {
        label: "Untagged",
        click: sendMenuAction("nav.untagged"),
      },
      {
        label: "Random",
        click: sendMenuAction("view.random"),
      },
      {
        label: "Trash",
        accelerator: accelerator("nav.trash"),
        registerAccelerator: false,
        click: sendMenuAction("nav.trash"),
      },
      { type: "separator" },
      {
        label: "Cycle Layout",
        accelerator: accelerator("view.layout-cycle"),
        registerAccelerator: false,
        click: sendMenuAction("view.layout.cycle"),
      },
      {
        label: "Waterfall",
        accelerator: accelerator("view.layout-waterfall"),
        registerAccelerator: false,
        click: sendMenuAction("view.layout.waterfall"),
      },
      {
        label: "Grid",
        accelerator: accelerator("view.layout-grid"),
        registerAccelerator: false,
        click: sendMenuAction("view.layout.grid"),
      },
      {
        label: "Justified",
        accelerator: accelerator("view.layout-justified"),
        registerAccelerator: false,
        click: sendMenuAction("view.layout.justified"),
      },
      {
        label: "List",
        accelerator: accelerator("view.layout-list"),
        registerAccelerator: false,
        click: sendMenuAction("view.layout.list"),
      },
      { type: "separator" },
      {
        label: "Toggle Sidebar",
        accelerator: accelerator("view.sidebar"),
        registerAccelerator: false,
        click: sendMenuAction("view.sidebar.toggle"),
      },
      {
        label: "Toggle Assistant",
        accelerator: accelerator("view.agent"),
        registerAccelerator: false,
        click: sendMenuAction("view.agent.toggle"),
      },
      {
        label: "Toggle Details",
        accelerator: accelerator("view.inspector"),
        registerAccelerator: false,
        click: sendMenuAction("view.inspector.toggle"),
      },
      {
        label: "Grayscale Overlay",
        accelerator: accelerator("view.grayscale"),
        registerAccelerator: false,
        click: sendMenuAction("view.grayscale"),
      },
      {
        label: "Show Subfolder Content",
        click: sendMenuAction("view.subfolders.toggle"),
      },
      {
        label: "Appearance",
        submenu: [
          {
            label: "Light",
            click: sendMenuAction("theme.light"),
          },
          {
            label: "Dark",
            click: sendMenuAction("theme.dark"),
          },
          {
            label: "Match System",
            click: sendMenuAction("theme.system"),
          },
        ],
      },
      { type: "separator" },
      {
        label: "Open with Default App",
        accelerator: accelerator("save.open"),
        registerAccelerator: false,
        click: sendMenuAction("save.open-with-default"),
      },
      {
        label: "Open Link in Browser",
        accelerator: accelerator("save.open-url"),
        registerAccelerator: false,
        click: sendMenuAction("save.open-original"),
      },
      {
        label: context.isMac ? "Reveal in Finder" : "Reveal in File Explorer",
        accelerator: accelerator("save.reveal"),
        registerAccelerator: false,
        click: sendMenuAction("save.reveal"),
      },
      { type: "separator" },
      {
        label: "Zoom In",
        accelerator: accelerator("view.zoom-in"),
        registerAccelerator: false,
        click: sendMenuAction("view.zoom-in"),
      },
      {
        label: "Zoom Out",
        accelerator: accelerator("view.zoom-out"),
        registerAccelerator: false,
        click: sendMenuAction("view.zoom-out"),
      },
      {
        label: "Reset Zoom",
        accelerator: accelerator("view.zoom-reset"),
        registerAccelerator: false,
        click: sendMenuAction("view.zoom-reset"),
      },
    ],
  };
}
