import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_library/_grid/tags/$tag")({
  staticData: { nav: (params) => ({ kind: "tag", name: params.tag ?? "" }) },
});
