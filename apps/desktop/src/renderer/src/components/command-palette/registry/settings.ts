import { SECTIONS } from "@/pages/settings/registry";
import type { Command } from "./types";

export const SETTINGS_COMMANDS: Command[] = SECTIONS.map((section) => ({
  id: `settings.${section.id}`,
  label: `Settings: ${section.label}`,
  description: `Open ${section.label}`,
  group: "Settings",
  scope: "settings",
  keywords: [section.path, section.label.toLowerCase(), "settings"],
  perform: ({ navigate, close }) => {
    navigate(`/settings/${section.path}`, { viewTransition: true });
    close();
  },
}));
