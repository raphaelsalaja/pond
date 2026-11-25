import { IconTrashXmark, IconUndo } from "@pond/icons";
import type { MenuItemSpec } from "@pond/ui";
import { confirmEmptyTrash } from "@/features/saves";

export function buildTrashMenuItems(hasItems: boolean): Array<MenuItemSpec> {
  return [
    {
      label: "Empty Trash",
      icon: <IconTrashXmark />,
      variant: "destructive",
      disabled: !hasItems,
      onClick: confirmEmptyTrash,
    },
    {
      label: "Restore All Items",
      icon: <IconUndo />,
      disabled: !hasItems,
      onClick: () => {
        void window.pond.query("saves.restoreAll", {});
      },
    },
  ];
}
