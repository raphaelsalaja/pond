import { createRootRoute } from "@tanstack/react-router";
import { RootShell } from "@/components/shell/root-shell";

export const Route = createRootRoute({
  component: RootShell,
});
