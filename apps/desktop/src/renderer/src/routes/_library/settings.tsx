import { IconNut } from "@pond/icons";
import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/features/settings/components/page";

export const Route = createFileRoute("/_library/settings")({
  staticData: { details: null, crumb: { label: "Settings", icon: IconNut } },
  component: SettingsPage,
});
