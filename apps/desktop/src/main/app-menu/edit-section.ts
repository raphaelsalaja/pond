import type { MenuActionId } from "../../shared/constants";
import type { AppMenuContext, AppMenuItem } from "./types";

const REVERSE_IMAGE_ENGINES = [
  ["Google Lens", "google-lens"],
  ["Bing", "bing"],
  ["Yandex", "yandex"],
  ["TinEye", "tineye"],
  ["SauceNAO", "saucenao"],
  ["Baidu", "baidu"],
  ["Sogou", "sogou"],
] as const;

export function buildEditSection(
  context: AppMenuContext,
  settingsItem: AppMenuItem,
): AppMenuItem {
  const { accelerator, sendMenuAction } = context;

  return {
    label: "Edit",
    submenu: [
      {
        label: "Undo",
        accelerator: "CmdOrCtrl+Z",
        click: context.edit.undo,
      },
      {
        label: "Redo",
        accelerator: "CmdOrCtrl+Shift+Z",
        click: context.edit.redo,
      },
      { type: "separator" },
      {
        label: "Cut",
        accelerator: "CmdOrCtrl+X",
        click: context.edit.cut,
      },
      {
        label: "Copy",
        accelerator: "CmdOrCtrl+C",
        click: context.edit.copy,
      },
      {
        label: "Paste",
        accelerator: "CmdOrCtrl+V",
        click: context.edit.paste,
      },
      {
        label: "Select All",
        accelerator: "CmdOrCtrl+A",
        registerAccelerator: false,
        click: context.edit.selectAll,
      },
      { type: "separator" },
      {
        label: "Select All Saves",
        accelerator: accelerator("grid.select-all"),
        registerAccelerator: false,
        click: sendMenuAction("selection.select-all"),
      },
      {
        label: "Deselect All",
        accelerator: accelerator("grid.clear"),
        registerAccelerator: false,
        click: sendMenuAction("selection.clear"),
      },
      {
        label: "Invert Selection",
        click: sendMenuAction("selection.invert"),
      },
      { type: "separator" },
      {
        label: "Copy Save",
        submenu: [
          {
            label: "Copy Image or Video",
            accelerator: accelerator("save.copy-image"),
            registerAccelerator: false,
            click: sendMenuAction("save.copy-media"),
          },
          {
            label: "Copy URL",
            accelerator: accelerator("save.copy-url"),
            registerAccelerator: false,
            click: sendMenuAction("save.copy-url"),
          },
          {
            label: "Copy Pond Link",
            click: sendMenuAction("save.copy-pond-link"),
          },
          {
            label: "Copy Name",
            click: sendMenuAction("save.copy-name"),
          },
          {
            label: "Copy File Path",
            click: sendMenuAction("save.copy-file-path"),
          },
          {
            label: "Copy Save ID",
            accelerator: accelerator("save.copy-id"),
            registerAccelerator: false,
            click: sendMenuAction("save.copy-id"),
          },
        ],
      },
      { type: "separator" },
      {
        label: "Search Current View",
        accelerator: accelerator("library.find"),
        registerAccelerator: false,
        click: sendMenuAction("find.search"),
      },
      {
        label: "Search All Saves",
        click: sendMenuAction("find.search-all"),
      },
      {
        label: "Search Pond",
        accelerator: accelerator("library.search"),
        registerAccelerator: false,
        click: sendMenuAction("library.search"),
      },
      {
        label: "Search by Image",
        submenu: [
          {
            label: "Similar Saves",
            click: sendMenuAction("find.visual-search"),
          },
          { type: "separator" },
          ...REVERSE_IMAGE_ENGINES.map(([label, engine]) => ({
            label,
            click: sendMenuAction(
              `find.reverse-image.${engine}` satisfies MenuActionId,
            ),
          })),
        ],
      },
      ...(!context.isMac ? [{ type: "separator" as const }, settingsItem] : []),
    ],
  };
}
