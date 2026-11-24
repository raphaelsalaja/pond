import { IconWindowDownload } from "@pond/icons";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_library/downloads")({
  staticData: {
    surface: "rail",
    railPage: "downloads",
    nav: () => ({ kind: "downloads" }),
    crumb: { label: "Downloads", icon: IconWindowDownload },
  },
  component: () => null,
});
