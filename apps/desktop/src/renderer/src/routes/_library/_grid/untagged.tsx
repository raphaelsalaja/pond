import { IconTagSlash } from "@pond/icons";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_library/_grid/untagged")({
  staticData: {
    nav: () => ({ kind: "untagged" }),
    crumb: { label: "Untagged", icon: IconTagSlash },
  },
});
