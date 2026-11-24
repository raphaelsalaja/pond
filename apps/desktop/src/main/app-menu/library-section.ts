import { SOURCES } from "@pond/schema/source-ids";
import { EXTERNAL_SOURCE_IDS, sourceLabel } from "@pond/schema/sources";
import { isWatchableSource, watchSourceLabel } from "@pond/schema/watches";
import { FILE_MENU_DUPLICATES_LABELS } from "../file-menu";
import { LIBRARY_MENU_LABELS } from "../library-menu";
import { sourcesSubmenu } from "../sources-menu";
import type { AppMenuContext, AppMenuItem } from "./types";

export function buildLibrarySection(context: AppMenuContext): AppMenuItem {
  const { accelerator, sendMenuAction } = context;

  return {
    label: "Library",
    submenu: [
      {
        label: LIBRARY_MENU_LABELS[0],
        click: sendMenuAction("library.new"),
      },
      {
        label: LIBRARY_MENU_LABELS[1],
        click: sendMenuAction("library.open"),
      },
      { type: "separator" },
      {
        label: LIBRARY_MENU_LABELS[2],
        click: context.revealLibrary,
      },
      {
        label: LIBRARY_MENU_LABELS[3],
        click: sendMenuAction("library.move"),
      },
      { type: "separator" },
      {
        label: "Sync",
        submenu: sourcesSubmenu({ accelerator, sendMenuAction }),
      },
      {
        label: "New Source",
        submenu: EXTERNAL_SOURCE_IDS.map((source) => ({
          label: sourceLabel(source),
          click: sendMenuAction(`library.connect-${source}`),
        })),
      },
      {
        label: "New Watch",
        submenu: SOURCES.filter(isWatchableSource).map((source) => ({
          label: watchSourceLabel(source),
          click: sendMenuAction(`library.watch-${source}`),
        })),
      },
      { type: "separator" },
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
      {
        label: LIBRARY_MENU_LABELS[4],
        accelerator: accelerator("library.rescan"),
        registerAccelerator: false,
        click: context.rescanLibrary,
      },
      {
        label: LIBRARY_MENU_LABELS[5],
        click: context.reloadLibrary,
      },
      {
        label: LIBRARY_MENU_LABELS[6],
        click: context.verifyLibrary,
      },
      { type: "separator" },
      {
        label: LIBRARY_MENU_LABELS[7],
        click: sendMenuAction("library.backup"),
      },
      {
        label: LIBRARY_MENU_LABELS[8],
        click: sendMenuAction("library.restore"),
      },
      {
        label: LIBRARY_MENU_LABELS[9],
        click: sendMenuAction("library.merge"),
      },
      { type: "separator" },
      {
        label: LIBRARY_MENU_LABELS[10],
        accelerator: accelerator("trash.empty"),
        registerAccelerator: false,
        click: sendMenuAction("trash.empty"),
      },
      {
        label: LIBRARY_MENU_LABELS[11],
        click: sendMenuAction("trash.restore-all"),
      },
    ],
  };
}
