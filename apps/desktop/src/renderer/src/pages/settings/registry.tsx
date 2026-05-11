import {
  IconBellOutline18,
  IconBoltOutline18,
  IconCircleInfoOutline18,
  IconClockRotateClockwiseOutline18,
  IconCloudOutline18,
  IconConnectedDotsOutline18,
  IconImagesOutline18,
  IconMagnifierSparkleOutline18,
  IconSliderOutline18,
  IconSparkleOutline18,
  IconStackOutline18,
  IconTagOutline18,
  IconTerminalOutline18,
  IconTrash2ContentOutline18,
  IconWandSparkleOutline18,
  IconWindowCode2Outline18,
  IconWorkflowOutline18,
} from "@pond/icons/outline";
import type { IconComponent } from "@pond/icons/types";
import type { ComponentType } from "react";
import { AboutSection } from "./sections/about";
import { AiEnrichmentSection } from "./sections/ai-enrichment";
import { AiProviderSection } from "./sections/ai-provider";
import { AiSearchSection } from "./sections/ai-search";
import { AutomationSection } from "./sections/automation";
import { BackupsSection } from "./sections/backups";
import { CaptureBehaviorSection } from "./sections/capture-behavior";
import { DeveloperSection } from "./sections/developer";
import { ExtensionSection } from "./sections/extension";
import { IntegrationsSection } from "./sections/integrations";
import { MediaSection } from "./sections/media";
import { NotificationsSection } from "./sections/notifications";
import { PreferencesSection } from "./sections/preferences";
import { StorageSection } from "./sections/storage";
import { TagsSection } from "./sections/tags";
import { TrashPrefsSection } from "./sections/trash";
import { UpdatesSection } from "./sections/updates";

/**
 * Section registry — single source of truth for the settings sidebar
 * AND the route definitions. Adding a section is a one-line edit:
 *
 *   1. Build the component in `sections/<name>.tsx`.
 *   2. Add an entry below — `path` becomes the URL, `group` controls
 *      the sidebar bucket.
 *
 * Group ordering in the sidebar follows `GROUP_ORDER` further down.
 *
 * Content-type-symmetric layout: Media is a peer group so future
 * types (audio, documents) drop in as sections on the Media page
 * without rerouting.
 */

export type SectionGroup =
  | "library"
  | "media"
  | "capture"
  | "intelligence"
  | "app";

export interface SectionDef {
  id: string;
  /** Path segment after `/settings/` (no leading slash). */
  path: string;
  label: string;
  icon: IconComponent;
  group: SectionGroup;
  component: ComponentType;
}

export const SECTIONS: SectionDef[] = [
  /* -------- Library -------- */
  {
    id: "storage",
    path: "storage",
    label: "Storage",
    icon: IconStackOutline18,
    group: "library",
    component: StorageSection,
  },
  {
    id: "tags",
    path: "tags",
    label: "Tags",
    icon: IconTagOutline18,
    group: "library",
    component: TagsSection,
  },
  {
    id: "trash-prefs",
    path: "trash-prefs",
    label: "Trash",
    icon: IconTrash2ContentOutline18,
    group: "library",
    component: TrashPrefsSection,
  },
  {
    id: "backups",
    path: "backups",
    label: "Backups & Export",
    icon: IconCloudOutline18,
    group: "library",
    component: BackupsSection,
  },

  /* -------- Media -------- */
  {
    id: "media",
    path: "media",
    label: "Media",
    icon: IconImagesOutline18,
    group: "media",
    component: MediaSection,
  },

  /* -------- Capture -------- */
  {
    id: "sources",
    // Path stays `integrations` so the `/settings/integrations/:source`
    // route in App.tsx and the `?connect=<source>` deep link from
    // refresh-action.tsx keep working without an extra redirect.
    path: "integrations",
    label: "Sources",
    icon: IconConnectedDotsOutline18,
    group: "capture",
    component: IntegrationsSection,
  },
  {
    id: "capture-behavior",
    path: "capture-behavior",
    label: "Capture Behavior",
    icon: IconBoltOutline18,
    group: "capture",
    component: CaptureBehaviorSection,
  },
  {
    id: "extension",
    path: "extension",
    label: "Browser Extension",
    icon: IconWindowCode2Outline18,
    group: "capture",
    component: ExtensionSection,
  },

  /* -------- Intelligence -------- */
  {
    id: "ai-provider",
    path: "ai/provider",
    label: "AI Provider",
    icon: IconSparkleOutline18,
    group: "intelligence",
    component: AiProviderSection,
  },
  {
    id: "ai-enrichment",
    path: "ai/enrichment",
    label: "Enrichment",
    icon: IconWandSparkleOutline18,
    group: "intelligence",
    component: AiEnrichmentSection,
  },
  {
    id: "ai-search",
    path: "ai/search",
    label: "Search & Embeddings",
    icon: IconMagnifierSparkleOutline18,
    group: "intelligence",
    component: AiSearchSection,
  },

  /* -------- App -------- */
  {
    id: "preferences",
    path: "preferences",
    label: "Preferences",
    icon: IconSliderOutline18,
    group: "app",
    component: PreferencesSection,
  },
  {
    id: "notifications",
    path: "notifications",
    label: "Notifications",
    icon: IconBellOutline18,
    group: "app",
    component: NotificationsSection,
  },
  {
    id: "updates",
    path: "updates",
    label: "Updates",
    icon: IconClockRotateClockwiseOutline18,
    group: "app",
    component: UpdatesSection,
  },
  {
    id: "automation",
    path: "automation",
    label: "Automation",
    icon: IconWorkflowOutline18,
    group: "app",
    component: AutomationSection,
  },
  {
    id: "developer",
    path: "developer",
    label: "Developer",
    icon: IconTerminalOutline18,
    group: "app",
    component: DeveloperSection,
  },
  {
    id: "about",
    path: "about",
    label: "About",
    icon: IconCircleInfoOutline18,
    group: "app",
    component: AboutSection,
  },
];

export const GROUP_ORDER: readonly SectionGroup[] = [
  "library",
  "media",
  "capture",
  "intelligence",
  "app",
] as const;

/**
 * Display label for each sidebar group. Every group is labeled in the
 * new layout — the old "unlabeled top group" pattern (which mirrored
 * Linear's account section) goes away because no group is uniquely
 * "yours" the way `personal` was.
 */
export const GROUP_LABELS: Record<SectionGroup, string | null> = {
  library: "Library",
  media: "Media",
  capture: "Capture",
  intelligence: "Intelligence",
  app: "App",
};

export function sectionsByGroup(group: SectionGroup): SectionDef[] {
  return SECTIONS.filter((s) => s.group === group);
}

/**
 * Default landing route when the user navigates to `/settings`.
 *
 * Computed eagerly so consumers don't have to handle `undefined` —
 * if the registry is ever emptied this will throw at module load,
 * which is the right failure mode (the settings rail is meaningless
 * with zero sections).
 */
function pickDefault(): SectionDef {
  const first = SECTIONS[0];
  if (!first) throw new Error("settings registry is empty");
  return first;
}

export const DEFAULT_SECTION: SectionDef = pickDefault();
