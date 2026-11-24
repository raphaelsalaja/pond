import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_library/_grid/uncategorized")({
  staticData: { nav: () => ({ kind: "uncategorized" }) },
});
