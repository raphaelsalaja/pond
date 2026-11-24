import { createFileRoute } from "@tanstack/react-router";
import { GridSurface } from "@/features/library/components/grid-surface";

export const Route = createFileRoute("/_library/_grid")({
  staticData: { surface: "grid" },
  component: GridSurface,
});
