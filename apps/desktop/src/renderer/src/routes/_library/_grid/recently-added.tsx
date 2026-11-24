import { IconAlbum2 } from "@pond/icons";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_library/_grid/recently-added")({
  staticData: {
    nav: () => ({ kind: "recentlyAdded" }),
    crumb: { label: "Recently Added", icon: IconAlbum2 },
  },
});
