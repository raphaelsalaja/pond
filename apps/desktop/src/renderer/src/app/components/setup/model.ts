import type { Prefs, ThemeDef } from "@pond/schema/db";
import type { AssistantProvider } from "@shared/assistant";
import type { SetupProfile } from "@/shared/state/setup";

/** Raise when setup gains a step everyone should see; installs below it are shown setup once more. */
export const SETUP_VERSION = 1;

export const STEP_IDS = [
  "welcome",
  "customize",
  "appearance",
  "assistant",
  "library",
  "import",
] as const;

export type StepId = (typeof STEP_IDS)[number];

export type AiOptionId =
  | "semanticSearch"
  | "enableOcr"
  | "enableTranscript"
  | "enableCaption"
  | "enableClip"
  | "enableAutoTitle"
  | "enableSuggestedTags";

export type OptionId =
  | AiOptionId
  | "launchAtLogin"
  | "menuBarIcon"
  | "soundsEnabled";

export const AI_OPTION_IDS = [
  "semanticSearch",
  "enableOcr",
  "enableTranscript",
  "enableCaption",
  "enableClip",
  "enableAutoTitle",
  "enableSuggestedTags",
] as const satisfies readonly AiOptionId[];

export type AssistantChoice = "later" | "cloud" | "subscription" | "local";

export type Appearance = "system" | "light" | "dark";

export interface LibraryFacts {
  name: string;
  path: string;
  /** Folder that holds the library bundle. */
  parent: string;
  saves: number;
}

export interface SetupChoices {
  libraryName: string;
  /** Folder that will hold the library bundle. */
  libraryLocation: string;
  moveLibrary: boolean;
  options: Readonly<Record<OptionId, boolean>>;
  assistant: AssistantChoice;
  provider: AssistantProvider;
  apiKey: string;
  endpoint: string;
  appearance: Appearance;
  lightPreset: string;
  darkPreset: string;
  lightTheme: ThemeDef;
  darkTheme: ThemeDef;
}

/** Recommended for a new Library: searchable right away, with no large first download. */
const RECOMMENDED = {
  semanticSearch: true,
  enableOcr: true,
} as const satisfies Partial<Record<AiOptionId, boolean>>;

export function parentFolder(path: string): string {
  const cut = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return cut > 0 ? path.slice(0, cut) : path;
}

export function choicesFrom(
  prefs: Prefs,
  library: LibraryFacts,
  profile: SetupProfile,
): SetupChoices {
  const { ai, preferences, quickCapture } = prefs;
  const recommended = profile === "new" ? RECOMMENDED : {};
  return {
    libraryName: library.name,
    libraryLocation: library.parent,
    moveLibrary: false,
    options: {
      semanticSearch: ai.semanticSearch,
      enableOcr: ai.enableOcr,
      enableTranscript: ai.enableTranscript,
      enableCaption: ai.enableCaption,
      enableClip: ai.enableClip,
      enableAutoTitle: ai.enableAutoTitle,
      enableSuggestedTags: ai.enableSuggestedTags,
      ...recommended,
      launchAtLogin: quickCapture.launchAtLogin,
      menuBarIcon: quickCapture.menuBarIcon,
      soundsEnabled: preferences.soundsEnabled,
    },
    assistant: "later",
    provider: "anthropic",
    apiKey: "",
    endpoint: "",
    appearance: preferences.appearance,
    lightPreset: preferences.lightPresetId,
    darkPreset: preferences.darkPresetId,
    lightTheme: preferences.light,
    darkTheme: preferences.dark,
  };
}

export function previewThemes(
  choices: SetupChoices,
  systemPrefersDark: boolean,
) {
  return {
    dark:
      choices.appearance === "dark" ||
      (choices.appearance === "system" && systemPrefersDark),
    light: choices.lightTheme,
    night: choices.darkTheme,
  };
}

export interface Session {
  profile: SetupProfile;
  library: LibraryFacts;
  initial: SetupChoices;
  choices: SetupChoices;
  index: number;
  direction: 1 | -1;
  busy: boolean;
  error: string;
}

export interface StepProps {
  profile: SetupProfile;
  library: LibraryFacts;
  choices: SetupChoices;
  update: (patch: Partial<SetupChoices>) => void;
}
