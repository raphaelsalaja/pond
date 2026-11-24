import type { Prefs } from "@pond/schema";
import type { KeywordSearchScope } from "@pond/schema/api";
import type { MenuItemSpec } from "@pond/ui";

export type SearchScopes = Prefs["search"]["scopes"];

const OPTIONS = [
  { key: "title", scope: "title", label: "Name" },
  { key: "description", scope: "description", label: "Description" },
  { key: "creator", scope: "creator", label: "Creator" },
  { key: "folder", scope: "folder", label: "Folder Name" },
  {
    key: "folderDescription",
    scope: "folder-description",
    label: "Folder Description",
  },
  { key: "extension", scope: "extension", label: "Extension" },
  { key: "tags", scope: "tags", label: "Tags" },
  { key: "url", scope: "url", label: "URL" },
  { key: "annotation", scope: "annotation", label: "Annotations" },
  { key: "notes", scope: "notes", label: "Notes" },
] as const satisfies ReadonlyArray<{
  key: keyof SearchScopes;
  scope: KeywordSearchScope;
  label: string;
}>;

export function keywordScopesFromPrefs(
  scopes: SearchScopes,
): Array<KeywordSearchScope> | undefined {
  const active = OPTIONS.flatMap((option): Array<KeywordSearchScope> =>
    scopes[option.key] ? [option.scope] : [],
  );
  return active.length === OPTIONS.length ? undefined : active;
}

export function buildSearchScopeItems({
  scopes,
  onChange,
}: {
  scopes: SearchScopes;
  onChange: (scopes: SearchScopes) => void;
}): Array<MenuItemSpec> {
  const activeCount = OPTIONS.filter((option) => scopes[option.key]).length;
  const all = activeCount === OPTIONS.length;
  return [
    {
      type: "checkbox",
      label: "Search All Fields",
      indicator: "check",
      checked: all,
      onCheckedChange: (checked) => {
        if (!checked) {
          return;
        }
        onChange({
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
        });
      },
    },
    { type: "separator" },
    ...OPTIONS.map((option): MenuItemSpec => ({
      type: "checkbox",
      label: option.label,
      indicator: "check",
      checked: scopes[option.key],
      disabled: scopes[option.key] && activeCount === 1,
      onCheckedChange: (checked) =>
        onChange({ ...scopes, [option.key]: checked }),
    })),
  ];
}
