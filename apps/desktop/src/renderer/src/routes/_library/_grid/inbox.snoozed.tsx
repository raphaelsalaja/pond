import { IconAlbum2 } from "@pond/icons";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_library/_grid/inbox/snoozed")({
  staticData: {
    nav: () => ({ kind: "inbox", snoozed: true }),
    crumb: { label: "Inbox", icon: IconAlbum2 },
  },
});
