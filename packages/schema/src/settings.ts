import { sourceLabel } from "./source-ids";
import { EXTERNAL_SOURCE_IDS } from "./sources/registry";

export type SettingsGroup = "general" | "library" | "harvesting" | "ai";

export interface SettingsSection {
  id: string;
  path: string;
  label: string;
  group: SettingsGroup;
  hidden?: boolean;
  parent?: string;
}

export const SETTINGS_SECTIONS: readonly SettingsSection[] = [
  { id: "general", path: "general", label: "Preferences", group: "general" },
  { id: "viewer", path: "viewer", label: "Preview", group: "general" },
  {
    id: "appearance",
    path: "appearance",
    label: "Appearance",
    group: "general",
  },
  {
    id: "shortcuts",
    path: "shortcuts",
    label: "Hotkeys",
    group: "general",
  },
  {
    id: "extension",
    path: "extension",
    label: "Browser Extension",
    group: "general",
  },
  {
    id: "local-api",
    path: "local-api",
    label: "Local API",
    group: "general",
  },
  { id: "tags", path: "tags", label: "Tags", hidden: true, group: "library" },
  {
    id: "library",
    path: "library",
    label: "Library",
    group: "library",
  },
  {
    id: "health",
    path: "health",
    label: "Library Health",
    group: "library",
  },
  {
    id: "storage",
    path: "storage",
    label: "Storage",
    group: "library",
  },
  { id: "backups", path: "backups", label: "Backups", group: "library" },
  {
    id: "processing",
    path: "processing",
    label: "Processing",
    group: "library",
  },
  { id: "schedule", path: "schedule", label: "Schedule", group: "harvesting" },
  { id: "sources", path: "sources", label: "Sources", group: "harvesting" },
  { id: "images", path: "images", label: "Images", group: "harvesting" },
  { id: "videos", path: "videos", label: "Videos", group: "harvesting" },
  { id: "models", path: "models", label: "Providers", group: "ai" },
  { id: "agent-models", path: "agent-models", label: "Models", group: "ai" },
  {
    id: "personalization",
    path: "personalization",
    label: "Personalization",
    group: "ai",
  },
  { id: "mcp", path: "mcp", label: "Model Context Protocol", group: "ai" },
  ...EXTERNAL_SOURCE_IDS.map(
    (source): SettingsSection => ({
      id: `sources-${source}`,
      path: `sources-${source}`,
      label: sourceLabel(source),
      group: "harvesting",
      hidden: true,
      parent: "sources",
    }),
  ),
];

export const SETTINGS_GROUP_ORDER: readonly SettingsGroup[] = [
  "general",
  "library",
  "harvesting",
  "ai",
];

export const SETTINGS_GROUP_LABELS = {
  general: null,
  library: "Workspace",
  harvesting: "Harvesting",
  ai: "Intelligence",
} satisfies Record<SettingsGroup, string | null>;
