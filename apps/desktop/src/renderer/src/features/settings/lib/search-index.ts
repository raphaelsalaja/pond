import type { ReactNode } from "react";
import { z } from "zod";
import type {
  GroupConfig,
  Item,
  SettingsValues,
} from "@/features/settings/lib/engine-types";
import { SECTIONS, type SectionDef } from "@/features/settings/lib/registry";
import { IS_MAC, REVEAL_LABEL, THIS_DEVICE } from "@/shared/lib/platform";

export interface SettingsSearchEntry {
  id: string;
  sectionId: string;
  sectionLabel: string;
  path: string;
  groupTitle?: string;
  itemKey?: string;
  title: string;
  description?: string;
  keywords: string[];
}

const TextNodeSchema = z.string().optional().catch(undefined);

function asText(node: ReactNode): string | undefined {
  return TextNodeSchema.parse(node);
}

/**
 * True when a `visible` predicate hides its row regardless of settings values
 * (e.g. macOS-only rows on Windows). Predicates that read a value can become
 * true later, so they stay searchable.
 */
function isStaticallyHidden(
  visible: ((values: SettingsValues) => boolean) | undefined,
): boolean {
  if (!visible) return false;
  let readsValues = false;
  /** SAFETY: the probe only answers property reads, and every read marks the predicate as value-dependent. */
  const probe = new Proxy({} as SettingsValues, {
    get: () => {
      readsValues = true;
      return undefined;
    },
  });
  try {
    return !visible(probe) && !readsValues;
  } catch {
    /** A predicate that cannot run on an empty probe depends on values. */
    return false;
  }
}

function itemTitle(item: Item): string | undefined {
  if (item.control === "custom") return asText(item.title);
  return item.title;
}

function itemEntries(
  section: SectionDef,
  group: GroupConfig,
): SettingsSearchEntry[] {
  const groupTitle = asText(group.title);
  const entries: SettingsSearchEntry[] = [];
  if (isStaticallyHidden(group.visible)) return entries;
  for (const item of group.items ?? []) {
    if (isStaticallyHidden(item.visible)) continue;
    const title = itemTitle(item);
    if (!title) continue;
    const description =
      "description" in item ? asText(item.description) : undefined;
    entries.push({
      id: `${section.id}:${item.key}`,
      sectionId: section.id,
      sectionLabel: section.label,
      path: section.path,
      groupTitle,
      itemKey: item.key,
      title,
      description,
      keywords: item.keywords ?? [],
    });
  }
  return entries;
}

function sectionEntries(section: SectionDef): SettingsSearchEntry[] {
  const { config } = section;
  const entries: SettingsSearchEntry[] = [];

  entries.push({
    id: section.id,
    sectionId: section.id,
    sectionLabel: section.label,
    path: section.path,
    title: asText(config.title) ?? section.label,
    description: asText(config.description),
    keywords: config.keywords ?? [],
  });

  for (const group of config.groups ?? []) {
    entries.push(...itemEntries(section, group));
  }
  return entries;
}

export const SETTINGS_SEARCH_INDEX: SettingsSearchEntry[] = SECTIONS.filter(
  (section) => !section.hidden,
).flatMap(sectionEntries);

const MANUAL_ENTRIES = [
  ["library", "Library", "logo", "Logo", `Choose an image from ${THIS_DEVICE}`],
  ["library", "Library", "name", "Name", "Rename the open library"],
  [
    "library",
    "Library",
    "recent",
    "Recent Libraries",
    "Switch between recent libraries",
  ],
  [
    "storage",
    "Storage",
    "location",
    "Library Location",
    IS_MAC
      ? "Reveal your library in Finder"
      : `${REVEAL_LABEL} for your library`,
  ],
  [
    "storage",
    "Storage",
    "move",
    "Move Library",
    "Move your library to a new location",
  ],
  ["backups", "Backups", "backup", "Back Up Library", "Create a backup"],
  [
    "backups",
    "Backups",
    "restore",
    "Restore Backup",
    "Verify and restore a backup",
  ],
] as const;

for (const [
  sectionId,
  sectionLabel,
  key,
  title,
  description,
] of MANUAL_ENTRIES) {
  SETTINGS_SEARCH_INDEX.push({
    id: `${sectionId}:${key}`,
    sectionId,
    sectionLabel,
    path: sectionId,
    itemKey: key,
    title,
    description,
    keywords: [],
  });
}
