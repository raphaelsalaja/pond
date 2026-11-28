import { IconTag } from "@pond/icons";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_library/tags")({
  staticData: {
    surface: "rail",
    railPage: "tags",
    details: null,
    nav: () => ({ kind: "tags" }),
    crumb: { label: "Tags", icon: IconTag },
  },
  component: () => null,
});
