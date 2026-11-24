import { IconHistory } from "@pond/icons";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_library/_grid/recents")({
  staticData: {
    nav: () => ({ kind: "recents" }),
    crumb: { label: "Recently Used", icon: IconHistory },
  },
});
