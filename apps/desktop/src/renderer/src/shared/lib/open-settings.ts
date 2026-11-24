import { SETTINGS_SECTIONS } from "@pond/schema";
import { getAppHistory } from "@/shared/lib/app-router";

const VALID_PATHS = new Set(SETTINGS_SECTIONS.map((section) => section.path));

export const DEFAULT_SETTINGS_SECTION = SETTINGS_SECTIONS[0]?.path ?? "general";

let lastSection = DEFAULT_SETTINGS_SECTION;

interface SettingsLocation {
  section: string;
  hash: string | null;
}

export function resolveSettingsSection(section?: string): string {
  const requested = section ?? lastSection;
  return VALID_PATHS.has(requested) ? requested : DEFAULT_SETTINGS_SECTION;
}

export function rememberSettingsSection(section: string): void {
  lastSection = resolveSettingsSection(section);
}

export function resolveSettingsLocation(
  section?: string,
  hash?: string,
): SettingsLocation {
  return {
    section: resolveSettingsSection(section),
    hash: hash?.replace(/^#/, "") || null,
  };
}

export function settingsHref(section?: string, hash?: string): string {
  const resolved = resolveSettingsLocation(section, hash);
  lastSection = resolved.section;
  const path = `/settings/${resolved.section}`;
  return resolved.hash ? `${path}#${resolved.hash}` : path;
}

export function openSettings(section?: string, hash?: string): void {
  getAppHistory()?.push(settingsHref(section, hash));
}
