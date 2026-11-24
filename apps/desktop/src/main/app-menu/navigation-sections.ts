import type { RecentMenuEntry } from "../../shared/constants";
import type { AppMenuContext, AppMenuItem } from "./types";

export function buildGoSection(context: AppMenuContext): AppMenuItem {
  const { accelerator, sendMenuAction } = context;

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
        label: "All Saves",
        accelerator: accelerator("nav.library"),
        registerAccelerator: false,
        click: sendMenuAction("nav.library"),
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
        label: "Tags",
        click: sendMenuAction("nav.tags"),
      },
      { type: "separator" },
      {
        label: "Sources",
        accelerator: accelerator("nav.sources"),
        registerAccelerator: false,
        click: sendMenuAction("nav.sources"),
      },
      {
        label: "Downloads",
        accelerator: accelerator("nav.downloads"),
        registerAccelerator: false,
        click: sendMenuAction("nav.downloads"),
      },
      {
        label: "Trash",
        accelerator: accelerator("nav.trash"),
        registerAccelerator: false,
        click: sendMenuAction("nav.trash"),
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
