import {
  IconBellOutline18,
  IconBoltOutline18,
  IconCircleInfoOutline18,
  IconClockRotateClockwiseOutline18,
  IconCloudOutline18,
  IconConnectedDotsOutline18,
  IconLayersOutline18,
  IconMediaPlayOutline18,
  IconSliderOutline18,
  IconSparkleOutline18,
  IconStackOutline18,
  IconTagOutline18,
  IconTrash2ContentOutline18,
  IconWindowCode2Outline18,
} from "@pond/icons/outline";
import type { IconComponent } from "@pond/icons/types";
import type { ComponentType } from "react";
import { AboutSection } from "./sections/about";
import { AiSection } from "./sections/ai";
import { BackupsSection } from "./sections/backups";
import { DeveloperSection } from "./sections/developer";
import { ExtensionSection } from "./sections/extension";
import { IntegrationsSection } from "./sections/integrations";
import { NotificationsSection } from "./sections/notifications";
import { PreferencesSection } from "./sections/preferences";
import { QuickCaptureSection } from "./sections/quick-capture";
import { SaveBehaviorSection } from "./sections/save-behavior";
import { StorageSection } from "./sections/storage";
import { TagsSection } from "./sections/tags";
import { TrashPrefsSection } from "./sections/trash";
import { UpdatesSection } from "./sections/updates";
import { VideosSection } from "./sections/videos";

/**
 * Section registry — single source of truth for the settings sidebar
 * AND the route definitions. Adding a section is a one-line edit:
 *
 *   1. Build the component in `sections/<name>.tsx`.
 *   2. Add an entry below — `path` becomes the URL, `group` controls
 *      the sidebar bucket.
 *
 * Group ordering in the sidebar follows `GROUP_ORDER` further down.
 */

export type SectionGroup =
  | "personal"
  | "library"
  | "capture"
  | "features"
  | "system";

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
  /* -------- Personal -------- */
  {
    id: "preferences",
    path: "preferences",
    label: "Preferences",
    icon: IconSliderOutline18,
    group: "personal",
    component: PreferencesSection,
  },
  {
    id: "notifications",
    path: "notifications",
    label: "Notifications",
    icon: IconBellOutline18,
    group: "personal",
    component: NotificationsSection,
  },

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
    label: "Backups",
    icon: IconCloudOutline18,
    group: "library",
    component: BackupsSection,
  },

  /* -------- Capture -------- */
  {
    id: "extension",
    path: "extension",
    label: "Browser Extension",
    icon: IconWindowCode2Outline18,
    group: "capture",
    component: ExtensionSection,
  },
  {
    id: "quick-capture",
    path: "quick-capture",
    label: "Quick Capture",
    icon: IconBoltOutline18,
    group: "capture",
    component: QuickCaptureSection,
  },
  {
    id: "save-behavior",
    path: "save-behavior",
    label: "Save Behavior",
    icon: IconLayersOutline18,
    group: "capture",
    component: SaveBehaviorSection,
  },
  {
    id: "integrations",
    path: "integrations",
    label: "Integrations",
    icon: IconConnectedDotsOutline18,
    group: "capture",
    component: IntegrationsSection,
  },
  {
    id: "videos",
    path: "videos",
    label: "Videos",
    icon: IconMediaPlayOutline18,
    group: "capture",
    component: VideosSection,
  },

  /* -------- Features -------- */
  {
    id: "ai",
    path: "ai",
    label: "AI & Agents",
    icon: IconSparkleOutline18,
    group: "features",
    component: AiSection,
  },

  /* -------- System -------- */
  {
    id: "updates",
    path: "updates",
    label: "Updates",
    icon: IconClockRotateClockwiseOutline18,
    group: "system",
    component: UpdatesSection,
  },
  {
    id: "developer",
    path: "developer",
    label: "Developer",
    icon: IconWindowCode2Outline18,
    group: "system",
    component: DeveloperSection,
  },
  {
    id: "about",
    path: "about",
    label: "About",
    icon: IconCircleInfoOutline18,
    group: "system",
    component: AboutSection,
  },
];

export const GROUP_ORDER: readonly SectionGroup[] = [
  "personal",
  "library",
  "capture",
  "features",
  "system",
] as const;

/**
 * Display label for each sidebar group. The first group ("personal")
 * intentionally has no label, matching Linear.
 */
export const GROUP_LABELS: Record<SectionGroup, string | null> = {
  personal: null,
  library: "Library",
  capture: "Capture",
  features: "Features",
  system: "System",
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
