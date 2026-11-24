import { IconTrashXmark } from "@pond/icons";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_library/_grid/trash")({
  staticData: {
    nav: () => ({ kind: "trash" }),
    crumb: { label: "Trash", icon: IconTrashXmark },
  },
});
