import type { Prefs } from "@pond/schema/db";
import { providerGroup } from "@shared/assistant";
import { addedProvidersWith } from "@/features/settings/components/sections/agent/provider-settings";
import { keyRowsSchema } from "@/features/settings/components/sections/agent/types";
import { loadPrefs, savePrefsSection } from "@/shared/state/prefs";
import type { SetupProfile } from "@/shared/state/setup";
import {
  AI_OPTION_IDS,
  type LibraryFacts,
  SETUP_VERSION,
  type SetupChoices,
} from "./model";

function failure(cause: unknown, fallback: string): string {
  return cause instanceof Error && cause.message ? cause.message : fallback;
}

function endpointPatch(choices: SetupChoices): Partial<Prefs["agent"]> {
  const endpoint = choices.endpoint.trim();
  if (choices.provider === "ollama") return { ollamaBaseUrl: endpoint };
  if (choices.provider === "lmstudio") return { lmstudioBaseUrl: endpoint };
  return {};
}

/** Connects the chosen provider through the same checks as Settings; resolves to an error message, or "" once connected. */
export async function connectAssistant(choices: SetupChoices): Promise<string> {
  if (choices.assistant === "later") return "";
  const { provider } = choices;
  const group = providerGroup(provider);
  const key = choices.apiKey.trim();
  try {
    const keys = keyRowsSchema.parse(await window.pond.query("agent.keys", {}));
    const connected = keys.some(
      (row) => row.provider === provider && row.hasKey,
    );
    if (group === "cloud" && !key && !connected)
      return "Enter an API key to connect, or choose Not Now.";
    if (group === "local" && provider !== "apple" && !choices.endpoint.trim())
      return "Enter the address of your model server.";
    if (group === "local")
      await savePrefsSection("agent", endpointPatch(choices));
    if (!(connected && !key)) {
      const result = await window.pond.query("agent.saveKey", {
        provider,
        key,
      });
      if (!result.ok) return result.error;
    }
    const { agent } = await loadPrefs();
    const agentPatch: Partial<Prefs["agent"]> = {
      addedProviders: addedProvidersWith(agent.addedProviders, keys, provider),
    };
    if (!agent.languageModel) agentPatch.languageModel = provider;
    await savePrefsSection("agent", agentPatch);
    return "";
  } catch (cause) {
    return failure(cause, "Couldn't connect. Check the details and try again.");
  }
}

async function savePreferences(
  choices: SetupChoices,
  initial: SetupChoices,
): Promise<void> {
  const { options } = choices;
  const ai: Partial<Prefs["ai"]> = {};
  for (const id of AI_OPTION_IDS) ai[id] = options[id];
  await savePrefsSection("ai", ai);
  const preferences: Partial<Prefs["preferences"]> = {
    appearance: choices.appearance,
    soundsEnabled: options.soundsEnabled,
  };
  if (choices.lightPreset !== initial.lightPreset) {
    preferences.lightPresetId = choices.lightPreset;
    preferences.light = choices.lightTheme;
  }
  if (choices.darkPreset !== initial.darkPreset) {
    preferences.darkPresetId = choices.darkPreset;
    preferences.dark = choices.darkTheme;
  }
  await savePrefsSection("preferences", preferences);
  const quickCapture = {
    launchAtLogin: options.launchAtLogin,
    menuBarIcon: options.menuBarIcon,
  };
  if (
    quickCapture.launchAtLogin !== initial.options.launchAtLogin ||
    quickCapture.menuBarIcon !== initial.options.menuBarIcon
  ) {
    await savePrefsSection("quickCapture", quickCapture);
    await window.pond.query("quickCapture.applyPrefs", {});
  }
}

function moveError(failure: { reason?: string; error?: string }): string {
  switch (failure.reason) {
    case "same_path":
      return "Pick a different location than the open library.";
    case "nested_path":
      return "Can't move into a folder inside the library.";
    case "destination_exists":
      return "That folder already has a library with this name. Pick another name or location.";
    case "not_writable":
      return "Pond can't write to that folder. Pick another location.";
    default:
      return failure.error ?? "Couldn't move the library. Try again.";
  }
}

function joinPath(folder: string, name: string): string {
  const separator = folder.includes("\\") && !folder.includes("/") ? "\\" : "/";
  return `${folder.replace(/[\\/]+$/, "")}${separator}${name}`;
}

function bundleName(path: string): string {
  return path.slice(
    Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\")) + 1,
  );
}

function libraryChange(
  choices: SetupChoices,
  library: LibraryFacts,
  profile: SetupProfile,
) {
  const name = choices.libraryName.trim() || library.name;
  const moved = choices.libraryLocation !== library.parent;
  const renamed = profile === "new" && name !== library.name;
  const kept = profile === "existing" && !(choices.moveLibrary && moved);
  return { name, moved: moved && !kept, renamed: renamed && !kept };
}

/** Moving or renaming the Library relaunches Pond into it. */
export function relaunchesLibrary(
  choices: SetupChoices,
  library: LibraryFacts,
  profile: SetupProfile,
): boolean {
  const { moved, renamed } = libraryChange(choices, library, profile);
  return moved || renamed;
}

/** Moves or renames the Library when asked; both relaunch Pond into it, so this runs last. */
async function saveLibrary(
  choices: SetupChoices,
  library: LibraryFacts,
  profile: SetupProfile,
): Promise<string> {
  const { name, moved, renamed } = libraryChange(choices, library, profile);
  if (moved) {
    if (renamed) {
      const identity = await window.pond.query("library.identity.update", {
        name,
      });
      if (!identity.ok) return identity.error;
    }
    const target = renamed ? name : bundleName(library.path);
    const result = await window.pond.query("library.move", {
      path: joinPath(choices.libraryLocation, target),
    });
    return result.ok ? "" : moveError(result);
  }
  if (!renamed) return "";
  const result = await window.pond.query("library.rename", { name });
  return result.ok ? "" : result.error;
}

/**
 * Opens a Library picked on disk; Pond relaunches into it and setup runs again with that Library's preferences.
 * @remarks Resolves to null when cancelled, an error message, or "" while Pond relaunches.
 */
export async function openExistingLibrary(): Promise<string | null> {
  try {
    const picked = await window.pond.query("library.pickExisting", {});
    if (!picked.ok || !picked.path) return null;
    const result = await window.pond.query("library.switchTo", {
      path: picked.path,
    });
    if (result.ok) return "";
    return (
      result.error ?? "Couldn't open that Library. Choose a .pond Library."
    );
  } catch (cause) {
    return failure(cause, "Couldn't open that Library. Try again.");
  }
}

/** Saves every choice, records that setup finished, then applies Library changes; resolves to an error message, or "" when done. */
export async function finishSetup(
  choices: SetupChoices,
  initial: SetupChoices,
  library: LibraryFacts,
  profile: SetupProfile,
): Promise<string> {
  try {
    await savePreferences(choices, initial);
    await savePrefsSection("setup", { version: SETUP_VERSION });
  } catch (cause) {
    return failure(cause, "Couldn't save your choices. Try again.");
  }
  try {
    return await saveLibrary(choices, library, profile);
  } catch (cause) {
    return failure(
      cause,
      "Couldn't update the library. Try again from Settings.",
    );
  }
}
