import { createFileRoute } from "@tanstack/react-router";
import { SplitPostsPage } from "@/features/library/components/split-posts";

export const Route = createFileRoute("/_library/split-posts")({
  component: SplitPostsPage,
});
