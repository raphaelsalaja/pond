import { createFileRoute, redirect } from "@tanstack/react-router";

/** A remembered path from an older build may no longer exist. */
export const Route = createFileRoute("/_library/$")({
  beforeLoad: () => {
    redirect({ to: "/", replace: true, throw: true });
  },
});
