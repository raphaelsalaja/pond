import { IconNodes3 } from "@pond/icons";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_library/sources")({
  staticData: {
    surface: "rail",
    railPage: "sources",
    details: null,
    nav: () => ({ kind: "sources" }),
    crumb: { label: "Sources", icon: IconNodes3 },
  },
  component: () => null,
});
