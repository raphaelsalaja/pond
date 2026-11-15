import { EXTERNAL_SOURCE_IDS } from "@pond/schema/sources";
import type { SectionConfig } from "@/features/settings/components/engine";
import { appearanceSection } from "@/features/settings/lib/config-appearance";
import { backupsSection } from "@/features/settings/lib/config-backups";
import { extensionSection } from "@/features/settings/lib/config-extension";
import { generalSection } from "@/features/settings/lib/config-general";
import {
  ScheduleSection,
  scheduleSection,
  sourcesSection,
} from "@/features/settings/lib/config-harvesting";
import { healthSection } from "@/features/settings/lib/config-health";
import { imagesSection } from "@/features/settings/lib/config-images";
import { librarySection } from "@/features/settings/lib/config-library";
import { localApiSection } from "@/features/settings/lib/config-local-api";
import { mcpSection } from "@/features/settings/lib/config-mcp";
import { processingSection } from "@/features/settings/lib/config-processing";
import { sourceDownloadsSection } from "@/features/settings/lib/config-source-downloads";
import { storageSection } from "@/features/settings/lib/config-storage";
import { videosSection } from "@/features/settings/lib/config-videos";
import { viewerSection } from "@/features/settings/lib/config-viewer";
import { sourceSectionId } from "@/features/settings/lib/download-sources";
import { lazyWithPreload } from "@/shared/lib/lazy-with-preload";

const TagsSection = lazyWithPreload(() =>
  import("@/features/tags/manager").then((m) => m.TagsSection),
);
const AgentSection = lazyWithPreload(() =>
  import("@/features/settings/components/sections/agent").then(
    (m) => m.AgentSection,
  ),
);
const ModelsSection = lazyWithPreload(() =>
  import("@/features/settings/components/sections/agent/models").then(
    (m) => m.ModelsSection,
  ),
);
const PersonalizationSection = lazyWithPreload(() =>
  import("@/features/settings/components/sections/agent/personalization").then(
    (m) => m.PersonalizationSection,
  ),
);
const McpSection = lazyWithPreload(() =>
  import("@/features/settings/components/sections/mcp").then(
    (m) => m.McpSection,
  ),
);
const LocalApiSection = lazyWithPreload(() =>
  import("@/features/settings/components/sections/local-api").then(
    (m) => m.LocalApiSection,
  ),
);
const ShortcutSettings = lazyWithPreload(() =>
  import("@/features/shortcuts").then((m) => m.ShortcutSettings),
);

export const SECTION_PRELOADS = [
  TagsSection.preload,
  AgentSection.preload,
  ModelsSection.preload,
  PersonalizationSection.preload,
  McpSection.preload,
  LocalApiSection.preload,
  ShortcutSettings.preload,
  ScheduleSection.preload,
];

export const SECTION_CONFIGS = new Map<string, SectionConfig>([
  ["general", generalSection],
  ["viewer", viewerSection],
  ["appearance", appearanceSection],
  ["extension", extensionSection],
  ["local-api", { ...localApiSection, component: LocalApiSection }],
  [
    "shortcuts",
    {
      component: ShortcutSettings,
      title: "Hotkeys",
      keywords: ["hotkeys", "keys", "commands", "Eagle"],
    },
  ],
  [
    "tags",
    {
      component: TagsSection,
      title: "Tags",
      description: "Organize, merge, and archive tags.",
      keywords: ["labels", "groups", "merge", "archive", "rename", "organize"],
    },
  ],
  [
    "models",
    {
      component: AgentSection,
      title: "Providers",
      description:
        "Connect the AI providers your fish use with your keys or a local host you run.",
      keywords: [
        "ai",
        "agent",
        "openai",
        "anthropic",
        "gemini",
        "ollama",
        "key",
        "provider",
        "intelligence",
        "integrations",
        "language",
        "vision",
      ],
    },
  ],
  [
    "agent-models",
    {
      component: ModelsSection,
      title: "Models",
      description: "Choose which models your fish can use.",
      keywords: [
        "ai",
        "agent",
        "intelligence",
        "catalog",
        "visibility",
        "models",
        "pricing",
        "context",
      ],
    },
  ],
  [
    "personalization",
    {
      component: PersonalizationSection,
      title: "Personalization",
      description: "Give your fish context about you and how you like replies.",
      keywords: [
        "ai",
        "agent",
        "intelligence",
        "personalisation",
        "profile",
        "instructions",
        "responses",
      ],
    },
  ],
  ["library", librarySection],
  ["health", healthSection],
  ["storage", storageSection],
  ["backups", backupsSection],
  ["processing", processingSection],
  ["schedule", scheduleSection],
  ["sources", sourcesSection],
  ["images", imagesSection],
  ["videos", videosSection],
  [
    "mcp",
    {
      ...mcpSection,
      component: McpSection,
    },
  ],
  ...EXTERNAL_SOURCE_IDS.map((source): [string, SectionConfig] => [
    sourceSectionId(source),
    sourceDownloadsSection(source),
  ]),
]);
