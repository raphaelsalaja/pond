import type { AppMenuContext, AppMenuItem } from "./types";

const FILTERS = [
  ["Color", "color"],
  ["Date Saved", "savedAt"],
  ["Folder", "folder"],
  ["Rating", "rating"],
  ["Shape", "shape"],
  ["Tag", "tags"],
  ["Type", "type"],
  ["Format", "format"],
  ["File Size", "fileSize"],
  ["Resolution", "width"],
  ["Duration", "duration"],
  ["Annotation", "caption"],
  ["Note", "note"],
  ["URL", "url"],
  ["BPM", "bpm"],
  ["Camera", "cameraModel"],
  ["Font", "fontFamily"],
] as const;

export function buildViewSection(context: AppMenuContext): AppMenuItem {
  const { accelerator, sendMenuAction } = context;

  return {
    label: "View",
    submenu: [
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
      {
        label: "Cycle Layout",
        accelerator: accelerator("view.layout-cycle"),
        registerAccelerator: false,
        click: sendMenuAction("view.layout.cycle"),
      },
      {
        label: "Random",
        click: sendMenuAction("view.random"),
      },
      { type: "separator" },
      {
        label: "Toggle Sidebar",
        accelerator: accelerator("view.sidebar"),
        registerAccelerator: false,
        click: sendMenuAction("view.sidebar.toggle"),
      },
      {
        label: "Toggle Details",
        accelerator: accelerator("view.inspector"),
        registerAccelerator: false,
        click: sendMenuAction("view.inspector.toggle"),
      },
      { type: "separator" },
      {
        label: "Toggle Filters",
        click: sendMenuAction("find.filters.toggle"),
      },
      {
        label: "Reset Filters",
        click: sendMenuAction("find.filters.reset"),
      },
      {
        label: "Filter By",
        submenu: FILTERS.map(([label, field]) => ({
          label,
          click: sendMenuAction(`find.filter.${field}`),
        })),
      },
      { type: "separator" },
      {
        label: "Show Subfolder Content",
        click: sendMenuAction("view.subfolders.toggle"),
      },
      {
        label: "Grayscale Overlay",
        accelerator: accelerator("view.grayscale"),
        registerAccelerator: false,
        click: sendMenuAction("view.grayscale"),
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
      { type: "separator" },
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
      { role: "togglefullscreen" },
    ],
  };
}
