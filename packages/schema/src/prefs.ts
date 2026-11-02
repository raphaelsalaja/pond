import { z } from "zod";
import { ExtensionSettingsSchema } from "./browser-extension";
import { FolderPresentationSchema } from "./folder-presentation";
import { FolderRulesSchema } from "./folder-rules";
import {
  DEFAULT_APP_ICON,
  DEFAULT_DARK_PRESET_ID,
  DEFAULT_DARK_THEME,
  DEFAULT_LIGHT_PRESET_ID,
  DEFAULT_LIGHT_THEME,
  DEFAULT_SOURCE_METRICS,
  DEFAULT_SYNC_CRON,
  type SourceMetricDisplay,
  type SyncAccounts,
  type SyncWatches,
  type ThemeAppearance,
  type WindowBounds,
} from "./prefs.types";
import { SavedViewPresentationSchema } from "./saved-view-presentation";
import { isSource } from "./sources";
import { ViewerPrefsSchema } from "./viewer-prefs";

export * from "./prefs.types";

const lightThemeDefSchema = z
  .object({
    accent: z.string(),
    background: z.string(),
    foreground: z.string(),
    contrast: z.number(),
  })
  .catch(DEFAULT_LIGHT_THEME);

const darkThemeDefSchema = z
  .object({
    accent: z.string(),
    background: z.string(),
    foreground: z.string(),
    contrast: z.number(),
  })
  .catch(DEFAULT_DARK_THEME);

const preferences = z.object({
  appearance: z
    .enum(["system", "light", "dark"])
    .catch("system" satisfies ThemeAppearance),
  lightPresetId: z.string().catch(DEFAULT_LIGHT_PRESET_ID),
  darkPresetId: z.string().catch(DEFAULT_DARK_PRESET_ID),
  light: lightThemeDefSchema.catch(DEFAULT_LIGHT_THEME),
  dark: darkThemeDefSchema.catch(DEFAULT_DARK_THEME),
  reduceMotion: z.enum(["system", "always", "never"]).catch("system"),
  tweetCover: z.enum(["media", "screenshot"]).catch("media"),
  soundsEnabled: z.boolean().catch(true),
});

export const SIDEBAR_DESTINATIONS = [
  "all",
  "uncategorized",
  "untagged",
  "recentlyAdded",
  "recentlyUsed",
  "tags",
  "random",
  "trash",
  "sources",
  "downloads",
] as const;

export type SidebarDestination = (typeof SIDEBAR_DESTINATIONS)[number];

export const LOCKED_SIDEBAR_DESTINATIONS = [
  "all",
  "trash",
] as const satisfies readonly SidebarDestination[];

export function isLockedSidebarDestination(
  destination: SidebarDestination,
): boolean {
  return LOCKED_SIDEBAR_DESTINATIONS.some((locked) => locked === destination);
}

export const SIDEBAR_SECTIONS = [
  "smartFolders",
  "fish",
  "canvases",
  "folders",
] as const;

export type SidebarSection = (typeof SIDEBAR_SECTIONS)[number];

export const SIDEBAR_BADGE_STYLES = ["count", "none"] as const;

export type SidebarBadgeStyle = (typeof SIDEBAR_BADGE_STYLES)[number];

const SidebarBadgeStyleSchema = z.enum(SIDEBAR_BADGE_STYLES);

function isSidebarDestination(value: string): value is SidebarDestination {
  return SIDEBAR_DESTINATIONS.some((destination) => destination === value);
}

export function normalizeSidebarDestinationOrder(
  order: readonly SidebarDestination[],
): SidebarDestination[] {
  const unique = [...new Set(order)];
  for (const [defaultIndex, destination] of SIDEBAR_DESTINATIONS.entries()) {
    if (unique.includes(destination)) continue;
    let insertionIndex = 0;
    for (let index = defaultIndex - 1; index >= 0; index -= 1) {
      const candidate = SIDEBAR_DESTINATIONS[index];
      if (candidate && unique.includes(candidate)) {
        insertionIndex = unique.indexOf(candidate) + 1;
        break;
      }
    }
    unique.splice(insertionIndex, 0, destination);
  }
  return unique;
}

const sidebar = z.object({
  badgeStyle: SidebarBadgeStyleSchema.catch("count"),
  /** Unknown keys are dropped so a retired destination never resets the rest. */
  badgeOverrides: z
    .record(z.string(), SidebarBadgeStyleSchema)
    .catch({})
    .transform((overrides) => {
      const known: Partial<Record<SidebarDestination, SidebarBadgeStyle>> = {};
      for (const [destination, style] of Object.entries(overrides))
        if (isSidebarDestination(destination)) known[destination] = style;
      return known;
    }),
  order: z
    .array(z.string())
    .catch([...SIDEBAR_DESTINATIONS])
    .transform((order) =>
      normalizeSidebarDestinationOrder(order.filter(isSidebarDestination)),
    ),
  doubleClickBehavior: z.enum(["open", "expand-collapse"]).catch("open"),
  sections: z
    .object({
      smartFolders: z.boolean().catch(true),
      fish: z.boolean().catch(true),
      canvases: z.boolean().catch(true),
      folders: z.boolean().catch(true),
    })
    .catch({ smartFolders: true, fish: true, canvases: true, folders: true }),
  destinations: z
    .object({
      all: z.boolean().catch(true),
      uncategorized: z.boolean().catch(true),
      untagged: z.boolean().catch(true),
      recentlyAdded: z.boolean().catch(true),
      recentlyUsed: z.boolean().catch(true),
      tags: z.boolean().catch(true),
      random: z.boolean().catch(true),
      trash: z.boolean().catch(true),
      downloads: z.boolean().catch(true),
      sources: z.boolean().catch(true),
    })
    .catch({
      all: true,
      uncategorized: true,
      untagged: true,
      recentlyAdded: true,
      recentlyUsed: true,
      tags: true,
      random: true,
      trash: true,
      downloads: true,
      sources: true,
    })
    .transform((destinations) => ({
      ...destinations,
      ...Object.fromEntries(
        LOCKED_SIDEBAR_DESTINATIONS.map((destination) => [destination, true]),
      ),
    })),
});

const feedback = z.object({
  sounds: z
    .object({
      interface: z.boolean().catch(true),
      saveDeletion: z.boolean().catch(true),
      folderDeletion: z.boolean().catch(true),
    })
    .catch({
      interface: true,
      saveDeletion: true,
      folderDeletion: true,
    }),
  notifications: z
    .object({
      saveDeletion: z.boolean().catch(false),
      folderDeletion: z.boolean().catch(false),
      extensionCapture: z.boolean().catch(true),
      autoImport: z.boolean().catch(true),
    })
    .catch({
      saveDeletion: false,
      folderDeletion: false,
      extensionCapture: true,
      autoImport: true,
    }),
});

const trash = z.object({
  autoEmptyDays: z.number().nullable().catch(null),
  confirmBeforeEmpty: z.boolean().catch(true),
});

const windowSlice = z.object({
  closeToTray: z.boolean().catch(false),
  launchHidden: z.boolean().catch(false),
  restorePosition: z.boolean().catch(true),
  bounds: z.custom<WindowBounds | null>().default(null),
  startupPage: z
    .enum(["continue", "library", "sources", "trash", "settings"])
    .catch("continue"),
  appIcon: z.string().min(1).catch(DEFAULT_APP_ICON),
  interfaceZoom: z.number().int().min(50).max(200).catch(100),
});

const system = z.object({
  proxyMode: z.enum(["system", "direct", "manual"]).catch("system"),
  proxyUrl: z.string().catch(""),
  hardwareAcceleration: z.boolean().catch(true),
  dockVisibility: z.enum(["automatic", "always"]).catch("automatic"),
});

const autoImport = z.object({
  enabled: z.boolean().catch(false),
  path: z.string().catch(""),
  mode: z.enum(["copy", "move"]).catch("copy"),
});

const quickCapture = z.object({
  menuBarIcon: z.boolean().catch(true),
  launchAtLogin: z.boolean().catch(false),
});

const tagPicker = z.object({
  layout: z.enum(["list", "grid"]).catch("list"),
  gridSize: z.enum(["sm", "md", "lg"]).catch("md"),
  showStarred: z.boolean().catch(true),
  showRecently: z.boolean().catch(true),
  showRecommended: z.boolean().catch(true),
  showCounts: z.boolean().catch(true),
  pinned: z.boolean().catch(false),
});

const search = z.object({
  scopes: z
    .object({
      title: z.boolean().catch(true),
      description: z.boolean().catch(true),
      creator: z.boolean().catch(true),
      tags: z.boolean().catch(true),
      notes: z.boolean().catch(true),
      url: z.boolean().catch(true),
      folder: z.boolean().catch(true),
      folderDescription: z.boolean().catch(true),
      extension: z.boolean().catch(true),
      annotation: z.boolean().catch(true),
    })
    .catch({
      title: true,
      description: true,
      creator: true,
      tags: true,
      notes: true,
      url: true,
      folder: true,
      folderDescription: true,
      extension: true,
      annotation: true,
    }),
});

const allTags = z.object({
  layout: z.enum(["list", "grid"]).catch("grid"),
  gridSize: z.enum(["sm", "md", "lg"]).catch("md"),
  showCounts: z.boolean().catch(true),
  sort: z.enum(["name", "count", "recent"]).catch("name"),
  sortDirection: z.enum(["asc", "desc"]).catch("asc"),
});

const sourcesView = z.object({
  metrics: z.custom<string[]>().default(DEFAULT_SOURCE_METRICS),
  metricDisplay: z.custom<Record<string, SourceMetricDisplay>>().default({}),
  days: z.number().catch(7),
});

const api = z.object({
  port: z.number().catch(41610),
  bindAddress: z.enum(["loopback", "lan"]).catch("loopback"),
  allowedOrigins: z.array(z.string()).catch([]),
});

const updates = z.object({
  autoInstall: z.boolean().catch(true),
});

const setup = z.object({
  /** Highest guided setup version finished on this computer; 0 means never. */
  version: z.number().int().min(0).catch(0),
});

export const FetchRecurrenceSchema = z
  .object({
    startDate: z.iso.date(),
    every: z.number().int().min(1).max(999),
    unit: z.enum(["hour", "day", "week", "month"]),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    days: z.array(z.number().int().min(0).max(6)),
  })
  .refine((rule) => rule.unit !== "week" || rule.days.length > 0, {
    message: "Choose at least one weekday",
  });

const sync = z.object({
  /** Accounts for a source this build doesn't know are dropped, so sync never looks up a missing source. */
  accounts: z
    .custom<SyncAccounts>()
    .default({})
    .transform((accounts) => {
      const known: SyncAccounts = {};
      for (const [id, account] of Object.entries(accounts))
        if (isSource(account.source)) known[id] = account;
      return known;
    }),
  watches: z.custom<SyncWatches>().default({}),
  cron: z
    .object({
      enabled: z.boolean().catch(true),
      intervalHours: z.number().min(1).catch(DEFAULT_SYNC_CRON.intervalHours),
      recurrence: FetchRecurrenceSchema.nullable().optional(),
      calendar: z
        .discriminatedUnion("kind", [
          z.object({
            kind: z.literal("daily"),
            time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
          }),
          z.object({
            kind: z.literal("weekly"),
            time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
            days: z.array(z.number().int().min(0).max(6)).min(1),
          }),
        ])
        .nullable()
        .optional(),
    })
    .catch({ ...DEFAULT_SYNC_CRON }),
});

const storage = z.object({
  lastBackup: z
    .object({
      path: z.string(),
      libraryRoot: z.string(),
      completedAt: z.string(),
    })
    .nullable()
    .catch(null),
  guardsEnabled: z.boolean().catch(false),
  maxLibraryGb: z.number().nullable().catch(50),
  warnAtPercent: z.number().catch(80),
  action: z.enum(["warn", "pauseSync", "pauseVideo"]).catch("warn"),
  watchIntervalMinutes: z.number().catch(5),
  /** Missing means on, so libraries saved before this setting still archive web pages. */
  autoArchive: z.boolean().catch(true),
});

export const AgentReasoningSchema = z.enum([
  "provider-default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
]);
export type AgentReasoning = z.infer<typeof AgentReasoningSchema>;

export const AgentContextChoiceSchema = z.union([
  z.literal("auto"),
  z.number().int().min(4_096).max(2_000_000),
]);
export type AgentContextChoice = z.infer<typeof AgentContextChoiceSchema>;

export const AgentModelOptionsSchema = z.object({
  fast: z.boolean().catch(false),
  context: AgentContextChoiceSchema.catch("auto"),
  reasoning: AgentReasoningSchema.catch("provider-default"),
});
export type AgentModelOptions = z.infer<typeof AgentModelOptionsSchema>;

export const AgentRunControlsSchema = z.object({
  fast: z.boolean(),
  contextTokens: z.number().int().min(4_096).max(2_000_000),
  reasoning: AgentReasoningSchema,
});
export type AgentRunControls = z.infer<typeof AgentRunControlsSchema>;

const agent = z.object({
  userProfile: z.string().max(8000).optional(),
  responseInstructions: z.string().max(8000).optional(),
  languageModel: z.string().catch(""),
  azureResourceName: z.string().catch(""),
  ollamaBaseUrl: z.string().catch("http://127.0.0.1:11434/v1"),
  lmstudioBaseUrl: z.string().catch("http://127.0.0.1:1234/v1"),
  ollamaModelId: z.string().catch("llama3.2"),
  lmstudioModelId: z.string().catch("local"),
  modelIds: z.record(z.string(), z.string()).catch({}),
  modelOptions: z.record(z.string(), AgentModelOptionsSchema).catch({}),
  customModelIds: z.record(z.string(), z.array(z.string())).optional(),
  visibleModelIds: z.record(z.string(), z.array(z.string())).optional(),
  enabledKeys: z.record(z.string(), z.boolean()).catch({}),
  addedProviders: z.array(z.string()).catch([]),
  connectedLocalProviders: z.record(z.string(), z.boolean()).optional(),
  mcpSearch: z.boolean().catch(true),
  mcpOpen: z.boolean().catch(true),
  mcpExport: z.boolean().catch(true),
});

const ai = z.object({
  semanticSearch: z.boolean().catch(false),
  embedModelId: z.string().catch(""),
  enableCaption: z.boolean().catch(false),
  enableOcr: z.boolean().catch(false),
  enableTranscript: z.boolean().catch(false),
  enableClip: z.boolean().catch(false),
  enableAesthetic: z.boolean().catch(false),
  enableSensitiveContent: z.boolean().catch(false),
  blurSensitiveThumbnails: z.boolean().catch(false),
  enableAutoTitle: z.boolean().catch(false),
  enableSuggestedTags: z.boolean().catch(false),
  mediaUnderstandingMode: z.enum(["florence", "gemma4"]).catch("florence"),
  mediaUnderstandingProvider: z.enum(["ollama", "lmstudio"]).catch("ollama"),
  mediaUnderstandingModelId: z.string().catch("gemma4:e2b"),
  captionModelId: z.string().catch(""),
  clipModelId: z.string().catch(""),
  whisperModelId: z.string().catch(""),
});

const recentSaveVisit = z.object({
  saveId: z.string(),
  visitedAt: z.number(),
});

export type RecentSaveVisit = z.infer<typeof recentSaveVisit>;

const saveRecents = z.object({
  entries: z.array(recentSaveVisit).catch([]),
});

const shortcuts = z.object({
  profile: z.enum(["pond", "eagle"]).catch("pond"),
  overrides: z.record(z.string(), z.string()).catch({}),
});

const PrefsObject = z.object({
  folderRules: z.record(z.string(), FolderRulesSchema).catch({}),
  folderViews: z.record(z.string(), FolderPresentationSchema).catch({}),
  savedViewViews: z.record(z.string(), SavedViewPresentationSchema).catch({}),
  viewer: ViewerPrefsSchema.catch(ViewerPrefsSchema.parse({})),
  shortcuts: shortcuts.catch(shortcuts.parse({})),
  preferences: preferences.catch(preferences.parse({})),
  sidebar: sidebar.catch(sidebar.parse({})),
  feedback: feedback.catch(feedback.parse({})),
  trash: trash.catch(trash.parse({})),
  window: windowSlice.catch(windowSlice.parse({})),
  system: system.catch(system.parse({})),
  quickCapture: quickCapture.catch(quickCapture.parse({})),
  autoImport: autoImport.catch(autoImport.parse({})),
  tagPicker: tagPicker.catch(tagPicker.parse({})),
  search: search.catch(search.parse({})),
  allTags: allTags.catch(allTags.parse({})),
  sourcesView: sourcesView.catch(sourcesView.parse({})),
  api: api.catch(api.parse({})),
  updates: updates.catch(updates.parse({})),
  setup: setup.catch(setup.parse({})),
  sync: sync.catch(sync.parse({})),
  storage: storage.catch(storage.parse({})),
  ai: ai.catch(ai.parse({})),
  agent: agent.catch(agent.parse({})),
  saveRecents: saveRecents.catch(saveRecents.parse({})),
  extension: ExtensionSettingsSchema.catch(ExtensionSettingsSchema.parse({})),
});

export type Prefs = z.infer<typeof PrefsObject>;

export const DEFAULT_PREFS: Prefs = PrefsObject.parse({});

export const PrefsSchema = PrefsObject.catch(DEFAULT_PREFS);

export const PrefsPatchSchema = PrefsObject.partial();

export type PrefsPatch = z.infer<typeof PrefsPatchSchema>;

export type PrefsPatchDeep = DeepPartial<Prefs>;

export type DeepPartial<T> = T extends object
  ? { [K in keyof T]?: DeepPartial<T[K]> }
  : T;

export interface StoredPrefsEnvelope {
  version: number;
  app: PrefsPatchDeep;
  pending: PrefsPatchDeep | null;
}

export type PrefsParsed = z.infer<typeof PrefsSchema>;
