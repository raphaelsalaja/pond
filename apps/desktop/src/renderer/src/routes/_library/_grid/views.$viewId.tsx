import { createFileRoute } from "@tanstack/react-router";

/** A smart folder or saved view narrows All; its rules come from the view, see `startViewUrlSync`. */
export const Route = createFileRoute("/_library/_grid/views/$viewId")({
  staticData: { nav: () => ({ kind: "all" }) },
});
