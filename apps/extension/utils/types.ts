import type { ExtensionSettings } from "@pond/schema/browser-extension";
import type { SessionImportResponse } from "@pond/schema/session";
import { SOURCES, type Source } from "@pond/schema/source-ids";
import { at, isRecord, type JsonValue } from "./json";

export const POND_EVENT = "pond:capture";

export interface PondCapturePayload {
  url: string;
  trigger?: string;
}

export interface PondLogEntry {
  level: "info" | "warn" | "error";
  message: string;
  data?: string;
}

/** Shape posted by injected MAIN-world scripts over `window.postMessage` before the content-script bridge relays it to the background. */
export type PondMessage =
  | { kind: "capture"; payload: PondCapturePayload }
  | {
      kind: "log";
      level: "info" | "warn" | "error";
      message: string;
      data?: string;
    };

export type PushSessionResult =
  | { ok: true; data: SessionImportResponse }
  | {
      ok: false;
      reason: "offline" | "no_cookies" | "network";
      detail?: string;
    };

export type ToolbarAction = "popup" | "save";

export type ThemePreference = "library" | "system" | "light" | "dark";

export type ScreenshotFormat = "png" | "jpeg";

export type SourceFlags = Record<Source, boolean>;

/** A type alias, not an interface, so it stays assignable to the stored `JsonValue`. */
export type PondSettings = {
  enabled: SourceFlags;
  likes: SourceFlags;
  toolbar: ToolbarAction;
  confirmations: boolean;
  askDetails: boolean;
  altClick: boolean;
  screenshotFormat: ScreenshotFormat;
  retina: boolean;
  theme: ThemePreference;
};

const ALL_SOURCES_ON = {
  twitter: true,
  instagram: true,
  pinterest: true,
  arena: true,
  cosmos: true,
  tiktok: true,
  youtube: true,
  reddit: true,
  threads: true,
  github: true,
  substack: true,
  tumblr: true,
  savee: true,
  behance: true,
  vimeo: true,
  dribbble: true,
  unsplash: true,
  bluesky: true,
  marked: true,
  web: false,
  local: false,
} satisfies SourceFlags;

export const DEFAULT_SETTINGS: PondSettings = {
  enabled: ALL_SOURCES_ON,
  likes: ALL_SOURCES_ON,
  toolbar: "popup",
  confirmations: true,
  askDetails: true,
  altClick: true,
  screenshotFormat: "png",
  retina: true,
  theme: "library",
};

const THEMES: readonly ThemePreference[] = [
  "library",
  "system",
  "light",
  "dark",
];

function readTheme(value: JsonValue | undefined): ThemePreference {
  return THEMES.find((theme) => theme === value) ?? "library";
}

function readFlags(value: JsonValue | undefined, fallback: SourceFlags) {
  const flags = { ...fallback };
  if (!isRecord(value)) return flags;
  for (const source of SOURCES) {
    if (source in value) flags[source] = Boolean(value[source]);
  }
  return flags;
}

function flagsFromPond(
  flags: ExtensionSettings["enabled"],
  fallback: SourceFlags,
) {
  const next = { ...fallback };
  for (const source of SOURCES) {
    const flag = flags[source];
    if (flag !== undefined) next[source] = flag;
  }
  return next;
}

export function settingsFromPond(settings: ExtensionSettings): PondSettings {
  return {
    ...settings,
    enabled: flagsFromPond(settings.enabled, DEFAULT_SETTINGS.enabled),
    likes: flagsFromPond(settings.likes, DEFAULT_SETTINGS.likes),
  };
}

export function normalizeStoredSettings(stored: JsonValue): PondSettings {
  return {
    enabled: readFlags(at(stored, "enabled"), DEFAULT_SETTINGS.enabled),
    likes: readFlags(at(stored, "likes"), DEFAULT_SETTINGS.likes),
    toolbar: at(stored, "toolbar") === "save" ? "save" : "popup",
    confirmations: at(stored, "confirmations") !== false,
    askDetails: at(stored, "askDetails") !== false,
    altClick: at(stored, "altClick") !== false,
    screenshotFormat:
      at(stored, "screenshotFormat") === "jpeg" ? "jpeg" : "png",
    retina: at(stored, "retina") !== false,
    theme: readTheme(at(stored, "theme")),
  };
}
