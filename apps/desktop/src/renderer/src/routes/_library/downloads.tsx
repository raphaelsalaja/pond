import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_library/downloads")({
  /** `RailPages` in the Library page keeps this page mounted across rail switches. */
  component: () => null,
});
