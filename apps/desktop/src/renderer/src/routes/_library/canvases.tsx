import { IconCanvas } from "@pond/icons";
import { createFileRoute } from "@tanstack/react-router";
import { CanvasIntro } from "@/features/canvas/components/intro";

export const Route = createFileRoute("/_library/canvases")({
  staticData: {
    details: null,
    sidebar: "rail",
    crumb: { label: "Canvases", icon: IconCanvas },
  },
  component: CanvasIntro,
});
