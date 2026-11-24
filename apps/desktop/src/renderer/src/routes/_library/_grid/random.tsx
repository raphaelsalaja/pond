import { IconAlbum2 } from "@pond/icons";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_library/_grid/random")({
  staticData: {
    nav: () => ({ kind: "random" }),
    crumb: { label: "Random", icon: IconAlbum2 },
  },
});
