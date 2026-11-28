import { IconLayers } from "@pond/icons";
import { createFileRoute } from "@tanstack/react-router";
import { SplitPostsPage } from "@/features/library/components/split-posts";

export const Route = createFileRoute("/_library/split-posts")({
  staticData: {
    details: null,
    nav: () => ({ kind: "splitPosts" }),
    crumb: { label: "Split Posts", icon: IconLayers },
  },
  component: SplitPostsPage,
});
