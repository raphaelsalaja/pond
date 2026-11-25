import { DEFAULT_FISH_ID } from "@shared/fish-contracts";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { fishPath } from "@/features/fish";

export const Route = createFileRoute("/_library/assistant")({
  beforeLoad: () => {
    redirect({ href: fishPath(DEFAULT_FISH_ID), throw: true });
  },
});
