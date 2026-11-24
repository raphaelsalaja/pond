import { IconLayers } from "@pond/icons";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_library/_grid/split-posts/$postKey")({
  staticData: {
    nav: (params) => ({ kind: "post", key: params.postKey ?? "" }),
    crumb: { label: "Split Posts", icon: IconLayers },
  },
});
