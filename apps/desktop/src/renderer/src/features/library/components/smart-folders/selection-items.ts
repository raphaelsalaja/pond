import type { SavedView } from "@pond/schema/db";
import type { MenuItemSpec } from "@pond/ui";
import {
  groupMoveChoices,
  selectedViewRoots,
} from "@/features/library/lib/smart-folders";
import { openOrganizationRenameDialog } from "@/features/library/state/organization-rename-dialog";
import { savedViews } from "@/features/library/state/saved-views";
import { exportSelectionCsv, exportSelectionFiles } from "@/features/saves";
import { runAction, saveIdsForView } from "./menu-items";

async function saveIdsForViews(
  selected: Array<SavedView>,
  views: Array<SavedView>,
): Promise<Array<string>> {
  return [
    ...new Set(
      (
        await Promise.all(selected.map((entry) => saveIdsForView(entry, views)))
      ).flat(),
    ),
  ];
}

export function selectionItems(
  selected: Array<string>,
  views: Array<SavedView>,
): Array<MenuItemSpec> {
  const selectedViews = views.filter((entry) => selected.includes(entry.id));
  const moveRoots = selectedViewRoots(selected, views);
  return [
    {
      label: "Batch Rename Smart Folders",
      onClick: () => openOrganizationRenameDialog("saved-views", selected),
    },
    {
      type: "submenu",
      label: "Move to Group",
      items: [
        {
          label: "Smart Folders",
          onClick: () =>
            void runAction(async () => {
              for (const entry of moveRoots) {
                await savedViews.move(entry.id, null);
              }
            }),
        },
        ...views.flatMap((group) =>
          group.kind === "group" &&
          selectedViews.every((entry) =>
            groupMoveChoices(entry.id, views).some(
              (choice) => choice.id === group.id,
            ),
          )
            ? [
                {
                  label: group.name,
                  onClick: () =>
                    void runAction(async () => {
                      for (const entry of moveRoots) {
                        await savedViews.move(entry.id, group.id);
                      }
                    }),
                },
              ]
            : [],
        ),
      ],
    },
    {
      label: "Export Files",
      onClick: () =>
        void runAction(async () => {
          await exportSelectionFiles(
            await saveIdsForViews(selectedViews, views),
          );
        }),
    },
    {
      label: "Export to CSV",
      onClick: () =>
        void runAction(async () => {
          await exportSelectionCsv(await saveIdsForViews(selectedViews, views));
        }),
    },
    {
      label: "Delete",
      variant: "destructive",
      onClick: () => {
        void (async () => {
          for (const entry of selectedViews.toSorted(
            (a, b) => Number(a.kind === "group") - Number(b.kind === "group"),
          )) {
            await savedViews.remove(entry.id);
          }
        })();
      },
    },
  ];
}
