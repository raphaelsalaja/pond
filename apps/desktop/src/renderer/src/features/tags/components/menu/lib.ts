export type TagNavId = "all" | "uncategorized" | string;

export interface TagNavItem {
  id: TagNavId;
  kind: "all" | "group" | "uncategorized";
  label: string;
  count: number;
}

interface RecentPartition<T> {
  recent: Array<T>;
  others: Array<T>;
}

export function partitionRecent<
  T extends { lastUsedAt: number | null; name: string },
>(tags: ReadonlyArray<T>): RecentPartition<T> {
  const recent: Array<T> = [];
  const others: Array<T> = [];
  for (const tag of tags) {
    if (tag.lastUsedAt !== null) {
      recent.push(tag);
    } else {
      others.push(tag);
    }
  }
  recent.sort(
    (a, b) =>
      (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0) || a.name.localeCompare(b.name),
  );
  others.sort((a, b) => a.name.localeCompare(b.name));
  return { recent, others };
}

export function filterByNav<T extends { id: string }>(
  tags: ReadonlyArray<T>,
  navId: TagNavId,
  groupedIds: ReadonlySet<string>,
  groupTagIds: ReadonlyMap<string, ReadonlySet<string>>,
): Array<T> {
  if (navId === "all") {
    return tags.slice();
  }
  if (navId === "uncategorized") {
    return tags.filter((tag) => !groupedIds.has(tag.id));
  }
  const ids = groupTagIds.get(navId);
  if (!ids) return [];
  return tags.filter((tag) => ids.has(tag.id));
}

export function buildTagNav(
  allCount: number,
  groups: ReadonlyArray<{
    id: string;
    name: string;
    count: number;
  }>,
  uncategorizedCount: number,
): Array<TagNavItem> {
  const items: Array<TagNavItem> = [
    { id: "all", kind: "all", label: "All", count: allCount },
  ];
  for (const group of groups) {
    items.push({
      id: group.id,
      kind: "group",
      label: group.name,
      count: group.count,
    });
  }
  if (uncategorizedCount > 0) {
    items.push({
      id: "uncategorized",
      kind: "uncategorized",
      label: "Uncategorized",
      count: uncategorizedCount,
    });
  }
  return items;
}

export function partitionPickerTags<
  T extends { starred: boolean; lastUsedAt: number | null; name: string },
>(tags: ReadonlyArray<T>, recommendedNames: ReadonlySet<string> = new Set()) {
  const starred = tags
    .filter((tag) => tag.starred)
    .sort((a, b) => a.name.localeCompare(b.name));
  const recommended = tags
    .filter(
      (tag) =>
        !tag.starred && recommendedNames.has(tag.name.trim().toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const reserved = new Set(
    [...starred, ...recommended].map((tag) => tag.name.trim().toLowerCase()),
  );
  return {
    starred,
    recommended,
    ...partitionRecent(
      tags.filter((tag) => !reserved.has(tag.name.trim().toLowerCase())),
    ),
  };
}

export function parseTagBatch(input: string): Array<string> {
  const tags: Array<string> = [];
  let value = "";
  let quoted = false;
  const push = () => {
    const cleaned = value.trim();
    value = "";
    if (
      cleaned &&
      !tags.some((tag) => tag.toLowerCase() === cleaned.toLowerCase())
    ) {
      tags.push(cleaned);
    }
  };
  for (const character of input) {
    if (character === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && [",", "\n"].includes(character)) {
      push();
      continue;
    }
    value += character;
  }
  push();
  return tags;
}
