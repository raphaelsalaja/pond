import type { RecentMenuEntry } from "../../shared/constants";
import type { AppMenuContext, AppMenuItem } from "./types";

export function buildGoSection(context: AppMenuContext): AppMenuItem {
  const { accelerator, navTo, sendMenuAction } = context;

  return {
    label: "Go",
    submenu: [
      {
        label: "Back",
        accelerator: accelerator("nav.back"),
        registerAccelerator: false,
        click: sendMenuAction("history.back"),
      },
      {
        label: "Forward",
        accelerator: accelerator("nav.forward"),
        registerAccelerator: false,
        click: sendMenuAction("history.forward"),
      },
      { type: "separator" },
      {
        label: "Inbox",
        click: sendMenuAction("nav.inbox"),
      },
      {
        label: "Library",
        accelerator: accelerator("nav.library"),
        registerAccelerator: false,
        click: navTo("/"),
      },
      {
        label: "Sources",
        accelerator: accelerator("nav.sources"),
        registerAccelerator: false,
        click: navTo("/sources"),
      },
      {
        label: "Downloads",
        accelerator: accelerator("nav.downloads"),
        registerAccelerator: false,
        click: navTo("/downloads"),
      },
      {
        label: "Trash",
        accelerator: accelerator("nav.trash"),
        registerAccelerator: false,
        click: navTo("/trash"),
      },
      {
        label: "Settings",
        accelerator: accelerator("nav.settings"),
        registerAccelerator: false,
        click: navTo("/settings"),
      },
      { type: "separator" },
      {
        label: "Search",
        accelerator: accelerator("library.search"),
        registerAccelerator: false,
        click: sendMenuAction("library.search"),
      },
    ],
  };
}

export function buildHistorySection(
  context: AppMenuContext,
  recentEntries: RecentMenuEntry[],
): AppMenuItem {
  return {
    label: "History",
    submenu:
      recentEntries.length === 0
        ? [{ label: "No Recent Items", enabled: false }]
        : [
            ...recentEntries.map((entry) => ({
              label: entry.title,
              click: context.openRecent(entry.id),
            })),
            { type: "separator" },
            {
              label: "Clear History",
              click: context.sendMenuAction("history.clear"),
            },
          ],
  };
}
