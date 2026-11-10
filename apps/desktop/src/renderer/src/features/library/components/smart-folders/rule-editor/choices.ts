import type { RuleChoice, RuleChoices } from "./types";

export interface RuleChoiceFolder {
  id: string;
  name: string;
  parentId?: string | null;
}

export interface RuleChoiceTag {
  name: string;
}

export interface RuleChoiceTagGroup {
  name: string;
  tagNames: readonly string[];
}

export interface RuleChoiceSource {
  folders: readonly RuleChoiceFolder[];
  tags: readonly RuleChoiceTag[];
  tagGroups: readonly RuleChoiceTagGroup[];
}

/** Parent or group, then name. Matches the details panel and Add Filter lists. */
function choiceOrderKey(choice: RuleChoice): string {
  return choice.crumb ? `${choice.crumb} ${choice.label}` : choice.label;
}

export function orderRuleChoices(choices: readonly RuleChoice[]): RuleChoice[] {
  return [...choices].sort((a, b) =>
    choiceOrderKey(a).localeCompare(choiceOrderKey(b)),
  );
}

function choice(
  value: string,
  label: string,
  crumb: string | undefined,
): RuleChoice {
  return crumb ? { value, label, crumb } : { value, label };
}

export function ruleChoices(source: RuleChoiceSource): RuleChoices {
  const tagGroupOf = new Map<string, string>();
  for (const group of source.tagGroups)
    for (const name of group.tagNames)
      if (!tagGroupOf.has(name.toLowerCase()))
        tagGroupOf.set(name.toLowerCase(), group.name);
  const folderNames = new Map(
    source.folders.map((folder) => [folder.id, folder.name]),
  );
  return {
    folders: orderRuleChoices(
      source.folders.map((folder) =>
        choice(
          folder.id,
          folder.name,
          folder.parentId ? folderNames.get(folder.parentId) : undefined,
        ),
      ),
    ),
    tags: orderRuleChoices(
      source.tags.map((tag) =>
        choice(tag.name, tag.name, tagGroupOf.get(tag.name.toLowerCase())),
      ),
    ),
  };
}
