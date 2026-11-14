import type { MenuActionId } from "../../shared/constants";
import type { AppMenuContext, AppMenuItem } from "./types";

const RATINGS = [
  ["No Rating", 0],
  ["1 Star", 1],
  ["2 Stars", 2],
  ["3 Stars", 3],
  ["4 Stars", 4],
  ["5 Stars", 5],
] as const;

export function buildOrganizeSection(context: AppMenuContext): AppMenuItem {
  const { accelerator, sendMenuAction } = context;
  return {
    label: "Organize",
    submenu: [
      {
        label: "Rating",
        submenu: RATINGS.map(([label, rating]) => ({
          label,
          accelerator: accelerator(`save.rate-${rating}`),
          registerAccelerator: false,
          click: sendMenuAction(
            `organize.rating.${rating}` satisfies MenuActionId,
          ),
        })),
      },
      {
        label: "Favorite",
        accelerator: accelerator("save.favorite"),
        registerAccelerator: false,
        click: sendMenuAction("organize.favorite"),
      },
      { type: "separator" },
      {
        label: "Add to Folders",
        accelerator: accelerator("save.assign-folders"),
        registerAccelerator: false,
        click: sendMenuAction("organize.add-to-folders"),
      },
      {
        label: "Add to Multiple Folders",
        accelerator: accelerator("save.assign-multiple-folders"),
        registerAccelerator: false,
        click: sendMenuAction("organize.add-to-multiple-folders"),
      },
      {
        label: "Add to Recent Folder",
        accelerator: accelerator("save.add-to-recent-folder"),
        registerAccelerator: false,
        click: sendMenuAction("organize.add-to-recent-folder"),
      },
      {
        label: "Add to Last Used Folder",
        accelerator: accelerator("save.add-to-last-folder"),
        registerAccelerator: false,
        click: sendMenuAction("organize.add-to-last-folder"),
      },
      {
        label: "Add Tags",
        accelerator: accelerator("save.add-tag"),
        registerAccelerator: false,
        click: sendMenuAction("organize.add-tag"),
      },
      {
        label: "Clear Tags",
        click: sendMenuAction("organize.clear-tags"),
      },
      { type: "separator" },
      {
        label: "Copy Tags",
        accelerator: accelerator("save.copy-tags"),
        registerAccelerator: false,
        click: sendMenuAction("organize.copy-tags"),
      },
      {
        label: "Paste Tags",
        accelerator: accelerator("save.paste-tags"),
        registerAccelerator: false,
        click: sendMenuAction("organize.paste-tags"),
      },
    ],
  };
}
