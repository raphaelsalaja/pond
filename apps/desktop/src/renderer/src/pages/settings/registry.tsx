import CircleUser from "@pond/icons/fill/circle-user";
import MediaPlay from "@pond/icons/fill/media-play";
import ClockRotateClockwise from "@pond/icons/fill-duo/clock-rotate-clockwise";
import Code from "@pond/icons/fill-duo/code";
import ConnectedDots from "@pond/icons/fill-duo/connected-dots";
import Dial from "@pond/icons/fill-duo/dial";
import Download from "@pond/icons/fill-duo/download";
import Equalizer from "@pond/icons/fill-duo/equalizer";
import Layers from "@pond/icons/fill-duo/layers";
import Slider from "@pond/icons/fill-duo/slider";
import Sparkle from "@pond/icons/fill-duo/sparkle";
import Stack from "@pond/icons/fill-duo/stack";
import WindowCode2 from "@pond/icons/fill-duo/window-code-2";
import Markdown from "@pond/icons/outline/markdown";
import type { ComponentType, SVGProps } from "react";
import {
  BellIcon,
  CloudIcon,
  CompassIcon,
  InfoIcon,
  LightningIcon,
  LockIcon,
  RefreshIcon,
  TagIcon,
  TrashIcon,
} from "./icons";
import { AboutSection } from "./sections/about";
import { AiSection } from "./sections/ai";
import { ApiSection } from "./sections/api";
import { BackupsSection } from "./sections/backups";
import { CaptionsSection } from "./sections/captions";
import { ConnectedAccountsSection } from "./sections/connected-accounts";
import { DeveloperSection } from "./sections/developer";
import { EmbeddingsSection } from "./sections/embeddings";
import { ExtensionSection } from "./sections/extension";
import { ImportExportSection } from "./sections/import-export";
import { IntegrationsSection } from "./sections/integrations";
import { LibrarySection } from "./sections/library";
import { NotificationsSection } from "./sections/notifications";
import { PreferencesSection } from "./sections/preferences";
import { ProfileSection } from "./sections/profile";
import { QuickCaptureSection } from "./sections/quick-capture";
import { ResetSection } from "./sections/reset";
import { SaveBehaviorSection } from "./sections/save-behavior";
import { SearchSection } from "./sections/search";
import { SecuritySection } from "./sections/security";
import { StorageSection } from "./sections/storage";
import { TagsSection } from "./sections/tags";
import { TrashPrefsSection } from "./sections/trash";
import { UpdatesSection } from "./sections/updates";
import { VideoToolsSection } from "./sections/video-tools";
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
  | "media"
  | "administration"
  | "advanced";

export interface SectionDef {
  id: string;
  /** Path segment after `/settings/` (no leading slash). */
  path: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  group: SectionGroup;
  component: ComponentType;
}

export const SECTIONS: SectionDef[] = [
  /* -------- Personal -------- */
  {
    id: "preferences",
    path: "preferences",
    label: "Preferences",
    icon: Slider,
    group: "personal",
    component: PreferencesSection,
  },
  {
    id: "profile",
    path: "profile",
    label: "Profile",
    icon: CircleUser,
    group: "personal",
    component: ProfileSection,
  },
  {
    id: "notifications",
    path: "notifications",
    label: "Notifications",
    icon: BellIcon,
    group: "personal",
    component: NotificationsSection,
  },
  {
    id: "security",
    path: "security",
    label: "Security & access",
    icon: LockIcon,
    group: "personal",
    component: SecuritySection,
  },
  {
    id: "connected-accounts",
    path: "connected-accounts",
    label: "Connected accounts",
    icon: ConnectedDots,
    group: "personal",
    component: ConnectedAccountsSection,
  },

  /* -------- Library -------- */
  {
    id: "storage",
    path: "storage",
    label: "Storage",
    icon: Stack,
    group: "library",
    component: StorageSection,
  },
  {
    id: "tags",
    path: "tags",
    label: "Tags",
    icon: TagIcon,
    group: "library",
    component: TagsSection,
  },
  {
    id: "trash-prefs",
    path: "trash-prefs",
    label: "Trash",
    icon: TrashIcon,
    group: "library",
    component: TrashPrefsSection,
  },
  {
    id: "library-identity",
    path: "library-identity",
    label: "Library identity",
    icon: CompassIcon,
    group: "library",
    component: LibrarySection,
  },
  {
    id: "import-export",
    path: "import-export",
    label: "Import & export",
    icon: Download,
    group: "library",
    component: ImportExportSection,
  },

  /* -------- Capture -------- */
  {
    id: "extension",
    path: "extension",
    label: "Browser extension",
    icon: WindowCode2,
    group: "capture",
    component: ExtensionSection,
  },
  {
    id: "quick-capture",
    path: "quick-capture",
    label: "Quick capture",
    icon: LightningIcon,
    group: "capture",
    component: QuickCaptureSection,
  },
  {
    id: "save-behavior",
    path: "save-behavior",
    label: "Save behavior",
    icon: Layers,
    group: "capture",
    component: SaveBehaviorSection,
  },

  /* -------- Features -------- */
  {
    id: "ai",
    path: "ai",
    label: "AI & Agents",
    icon: Sparkle,
    group: "features",
    component: AiSection,
  },
  {
    id: "embeddings",
    path: "embeddings",
    label: "Embeddings",
    icon: Equalizer,
    group: "features",
    component: EmbeddingsSection,
  },
  {
    id: "search",
    path: "search",
    label: "Search",
    icon: ConnectedDots,
    group: "features",
    component: SearchSection,
  },
  {
    id: "captions",
    path: "captions",
    label: "Captions",
    icon: Markdown,
    group: "features",
    component: CaptionsSection,
  },
  {
    id: "integrations",
    path: "integrations",
    label: "URL scheme & Shortcuts",
    icon: ConnectedDots,
    group: "features",
    component: IntegrationsSection,
  },

  /* -------- Media -------- */
  {
    id: "videos",
    path: "videos",
    label: "Videos",
    icon: MediaPlay,
    group: "media",
    component: VideosSection,
  },
  {
    id: "video-tools",
    path: "video-tools",
    label: "Video tools",
    icon: Dial,
    group: "media",
    component: VideoToolsSection,
  },

  /* -------- Administration -------- */
  {
    id: "api",
    path: "api",
    label: "API",
    icon: Code,
    group: "administration",
    component: ApiSection,
  },
  {
    id: "backups",
    path: "backups",
    label: "Backups",
    icon: CloudIcon,
    group: "administration",
    component: BackupsSection,
  },
  {
    id: "updates",
    path: "updates",
    label: "Updates",
    icon: ClockRotateClockwise,
    group: "administration",
    component: UpdatesSection,
  },

  /* -------- Advanced -------- */
  {
    id: "developer",
    path: "developer",
    label: "Developer",
    icon: WindowCode2,
    group: "advanced",
    component: DeveloperSection,
  },
  {
    id: "about",
    path: "about",
    label: "About",
    icon: InfoIcon,
    group: "advanced",
    component: AboutSection,
  },
  {
    id: "reset",
    path: "reset",
    label: "Reset",
    icon: RefreshIcon,
    group: "advanced",
    component: ResetSection,
  },
];

export const GROUP_ORDER: readonly SectionGroup[] = [
  "personal",
  "library",
  "capture",
  "features",
  "media",
  "administration",
  "advanced",
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
  media: "Media",
  administration: "Administration",
  advanced: "Advanced",
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
