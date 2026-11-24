import { IconLayers } from "@pond/icons";
import type { MenuEntry } from "./types";

const FALLBACK_COUNT = 3;

/** Before a query, a group shows a few actions and tucks the rest behind All Actions; typing searches all of them. */
export function offerEntries({
  group,
  key,
  entries,
  suggested,
  searching,
}: {
  group: string;
  key: string;
  entries: ReadonlyArray<MenuEntry>;
  suggested?: ReadonlySet<string>;
  searching: boolean;
}): Array<MenuEntry> {
  if (searching) {
    return [...entries];
  }
  const picked = suggested
    ? entries.filter((entry) => suggested.has(entry.label))
    : entries.slice(0, FALLBACK_COUNT);
  if (picked.length === entries.length) {
    return picked;
  }
  return [
    ...picked,
    {
      id: `${key}:all-actions`,
      group,
      label: "All Actions",
      icon: <IconLayers aria-hidden />,
      page: () => ({
        kind: "actions",
        key: `${key}:all-actions`,
        title: "All Actions",
        context: group,
        entries: entries.map((entry) => ({ ...entry, group: "" })),
      }),
    },
  ];
}
