import { EXTERNAL_SOURCE_IDS, sourceLabel } from "@pond/schema/sources";
import { isWatchableSource } from "../core/watch/types";
import {
  FILE_MENU_DUPLICATES_LABELS,
  FILE_MENU_EXPORT_LABELS,
  FILE_MENU_IMPORT_LABELS,
  FILE_MENU_NEW_LABELS,
} from "../file-menu";
import type { AppMenuContext, AppMenuItem } from "./types";

export function buildFileSection(context: AppMenuContext): AppMenuItem {
  const { accelerator, sendMenuAction } = context;

  return {
    label: "File",
    submenu: [
      {
        label: "New",
        submenu: [
          {
            label: FILE_MENU_NEW_LABELS[0],
            accelerator: accelerator("library.new-folder"),
            registerAccelerator: false,
            click: sendMenuAction("library.new-folder"),
          },
          {
            label: FILE_MENU_NEW_LABELS[1],
            click: sendMenuAction("library.new-smart-folder"),
          },
          {
            label: FILE_MENU_NEW_LABELS[2],
            click: sendMenuAction("library.new-smart-folder-group"),
          },
          {
            label: FILE_MENU_NEW_LABELS[3],
            click: sendMenuAction("library.auto-import-folder"),
          },
          { type: "separator" },
          {
            label: FILE_MENU_NEW_LABELS[4],
            accelerator: accelerator("library.new-note"),
            registerAccelerator: false,
            click: sendMenuAction("library.new-note"),
          },
          { type: "separator" },
          {
            label: "New Tag",
            accelerator: accelerator("library.new-tag"),
            registerAccelerator: false,
            click: sendMenuAction("library.new-tag"),
          },
          {
            label: "New Tag Group",
            accelerator: accelerator("library.new-tag-group"),
            registerAccelerator: false,
            click: sendMenuAction("library.new-tag-group"),
          },
        ],
      },
      {
        label: "Import",
        submenu: [
          {
            label: FILE_MENU_IMPORT_LABELS[0],
            accelerator: accelerator("library.import-files"),
            registerAccelerator: false,
            click: sendMenuAction("library.import-files"),
          },
          {
            label: FILE_MENU_IMPORT_LABELS[1],
            accelerator: accelerator("library.import-folders"),
            registerAccelerator: false,
            click: sendMenuAction("library.import-folders"),
          },
          {
            label: FILE_MENU_IMPORT_LABELS[2],
            accelerator: accelerator("library.import-links"),
            registerAccelerator: false,
            click: sendMenuAction("library.import-links"),
          },
          {
            label: "Import from Clipboard",
            click: sendMenuAction("library.import-clipboard"),
          },
          { type: "separator" },
          {
            label: "Import Bookmarks",
            click: sendMenuAction("library.import-bookmarks"),
          },
          {
            label: "Import mymind",
            click: sendMenuAction("library.import-mymind"),
          },
          {
            label: "Import Page Assets",
            click: sendMenuAction("library.import-page-assets"),
          },
          { type: "separator" },
          {
            label: FILE_MENU_IMPORT_LABELS[3],
            click: sendMenuAction("library.import-eagle"),
          },
          {
            label: FILE_MENU_IMPORT_LABELS[4],
            click: sendMenuAction("library.import-package"),
          },
        ],
      },
      {
        label: "Sources",
        submenu: [
          {
            label: "New Source",
            submenu: EXTERNAL_SOURCE_IDS.map((source) => ({
              label: sourceLabel(source),
              click: sendMenuAction(`library.connect-${source}`),
            })),
          },
          {
            label: "New Watch",
            submenu: EXTERNAL_SOURCE_IDS.filter(isWatchableSource).map(
              (source) => ({
                label: sourceLabel(source),
                click: sendMenuAction(`library.watch-${source}`),
              }),
            ),
          },
        ],
      },
      {
        label: "Library",
        submenu: [
          {
            label: "Find Duplicates",
            submenu: [
              {
                label: FILE_MENU_DUPLICATES_LABELS[0],
                click: sendMenuAction("library.find-duplicates-all"),
              },
              {
                label: FILE_MENU_DUPLICATES_LABELS[1],
                click: sendMenuAction("library.find-duplicates-list"),
              },
              {
                label: FILE_MENU_DUPLICATES_LABELS[2],
                click: sendMenuAction("library.find-duplicates-selected"),
              },
            ],
          },
          { type: "separator" },
          {
            label: "Rescan Library",
            accelerator: accelerator("library.rescan"),
            registerAccelerator: false,
            click: context.rescanLibrary,
          },
          {
            label: "Verify Integrity",
            click: context.verifyLibrary,
          },
        ],
      },
      {
        label: "Export",
        submenu: [
          {
            label: FILE_MENU_EXPORT_LABELS[0],
            accelerator: accelerator("save.export"),
            registerAccelerator: false,
            click: sendMenuAction("save.export-files"),
          },
          {
            label: FILE_MENU_EXPORT_LABELS[1],
            click: sendMenuAction("save.export-converted"),
          },
          { type: "separator" },
          {
            label: FILE_MENU_EXPORT_LABELS[2],
            click: sendMenuAction("save.export-eagle-package"),
          },
          {
            label: FILE_MENU_EXPORT_LABELS[3],
            click: sendMenuAction("save.export-pond-package"),
          },
          {
            label: FILE_MENU_EXPORT_LABELS[4],
            click: sendMenuAction("save.export-csv"),
          },
        ],
      },
      { type: "separator" },
      {
        label: "Library Window",
        click: context.openLibraryWindow,
      },
      { type: "separator" },
      {
        label: "Open with Default App",
        accelerator: accelerator("save.open"),
        registerAccelerator: false,
        click: sendMenuAction("save.open-with-default"),
      },
      {
        label: "Open Original in Browser",
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
        label: "Rename",
        accelerator: accelerator("save.rename"),
        registerAccelerator: false,
        click: sendMenuAction("save.rename"),
      },
      {
        label: "Add Tags",
        accelerator: accelerator("save.add-tag"),
        registerAccelerator: false,
        click: sendMenuAction("save.add-tag"),
      },
      {
        label: "Refresh from Source",
        accelerator: accelerator("save.refresh"),
        registerAccelerator: false,
        click: sendMenuAction("save.refresh"),
      },
      { type: "separator" },
      {
        label: "Move to Trash",
        accelerator: accelerator("save.trash"),
        registerAccelerator: false,
        click: sendMenuAction("save.trash"),
      },
      {
        label: "Restore from Trash",
        click: sendMenuAction("save.untrash"),
      },
      {
        label: "Delete Forever",
        accelerator: accelerator("save.delete-forever"),
        registerAccelerator: false,
        click: sendMenuAction("save.delete-forever"),
      },
      { type: "separator" },
      context.isMac
        ? {
            role: "close",
            label: "Close Window",
            accelerator: accelerator("app.close-window"),
          }
        : { role: "quit" },
    ],
  };
}
