import { createFileRoute, redirect } from "@tanstack/react-router";
import { DEFAULT_SETTINGS_SECTION } from "@/shared/lib/open-settings";

export const Route = createFileRoute("/_library/settings/")({
  beforeLoad: () => {
    redirect({ href: `/settings/${DEFAULT_SETTINGS_SECTION}`, throw: true });
  },
});
