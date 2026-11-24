import { IconAlbum2 } from "@pond/icons";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_library/_grid/inbox")({
  staticData: {
    nav: () => ({ kind: "inbox" }),
    crumb: { label: "Inbox", icon: IconAlbum2 },
  },
});
