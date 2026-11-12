import { normalizeLabelName } from "@pond/schema/label-name";
import { usePickerCursor } from "@pond/ui";
import { useMemo, useState } from "react";
import { tagOperations } from "@/features/tags/operations/tag-client";
import type { TagGroupRow } from "@/features/tags/state/tag-groups";
import type { TagRow } from "@/features/tags/state/tags";
import { errorCopy } from "@/shared/lib/error-copy";
import { placeCreateOptionLast } from "@/shared/lib/picker-order";
import { parseTagBatch, partitionPickerTags } from "./lib";
import type { CreateInfo, TagPickerRow, TagSection } from "./types";

interface TagMenuOptions {
  tags: readonly TagRow[];
  groups: readonly TagGroupRow[];
  appliedKeys: ReadonlySet<string> | undefined;
  onToggle: (
    name: string,
    options?: { created?: boolean },
  ) => void | Promise<void>;
  allowCreate: boolean;
  recommendedNames: readonly string[];
  layout: "list" | "grid";
  gridSize: "sm" | "md" | "lg";
  showStarred: boolean;
  showRecently: boolean;
  showRecommended: boolean;
}

function rowId(row: TagPickerRow) {
  return row.id;
}

function byName(a: TagRow, b: TagRow) {
  return a.name.localeCompare(b.name);
}

function gridColumns(size: "sm" | "md" | "lg") {
  if (size === "sm") return 3;
  if (size === "md") return 2;
  return 1;
}

export function useTagMenu({
  tags,
  groups,
  appliedKeys,
  onToggle,
  allowCreate,
  recommendedNames,
  layout,
  gridSize,
  showStarred,
  showRecently,
  showRecommended,
}: TagMenuOptions) {
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [recentOpen, setRecentOpen] = useState(true);
  const [othersOpen, setOthersOpen] = useState(true);
  const [collapsedGroups, setCollapsedGroups] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const list = layout === "list";

  const needle = query.trim().toLowerCase();
  const tagsByLower = useMemo(() => {
    const map = new Map<string, TagRow>();
    for (const tag of tags) map.set(tag.name.toLowerCase(), tag);
    return map;
  }, [tags]);
  const groupNamesByTag = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const group of groups)
      for (const tagId of group.tagIds)
        map.set(tagId, [...(map.get(tagId) ?? []), group.name]);
    return map;
  }, [groups]);
  const matching = useMemo(
    () =>
      needle
        ? tags.filter((tag) => {
            if (tag.name.toLowerCase().includes(needle)) return true;
            return (groupNamesByTag.get(tag.id) ?? []).some((name) =>
              name.toLowerCase().includes(needle),
            );
          })
        : tags,
    [groupNamesByTag, needle, tags],
  );
  const recommendedSet = useMemo(
    () => new Set(recommendedNames.map((name) => name.trim().toLowerCase())),
    [recommendedNames],
  );
  const partitioned = useMemo(() => {
    const result = partitionPickerTags(matching, recommendedSet);
    return {
      ...result,
      others: [
        ...(showStarred ? [] : result.starred),
        ...(showRecommended ? [] : result.recommended),
        ...(showRecently ? [] : result.recent),
        ...result.others,
      ].toSorted((a, b) => a.name.localeCompare(b.name)),
    };
  }, [recommendedSet, showRecently, showRecommended, showStarred, matching]);
  const visibleSectionCount = [
    showStarred ? partitioned.starred : [],
    showRecommended ? partitioned.recommended : [],
    showRecently ? partitioned.recent : [],
    partitioned.others,
  ].filter((items) => items.length > 0).length;
  const sections = useMemo<TagSection[]>(
    () => [
      {
        id: "starred",
        label: "Starred",
        items: showStarred ? partitioned.starred : [],
        open: true,
        collapsible: false,
        toggle: () => {},
      },
      {
        id: "recommended",
        label: "Recommended",
        items: showRecommended ? partitioned.recommended : [],
        open: true,
        collapsible: false,
        toggle: () => {},
      },
      {
        id: "recent",
        label: "Recently",
        items: showRecently ? partitioned.recent : [],
        open: recentOpen,
        collapsible: visibleSectionCount > 1,
        toggle: () => setRecentOpen((open) => !open),
      },
      {
        id: "others",
        label: "Others",
        items: partitioned.others,
        open: othersOpen,
        collapsible: visibleSectionCount > 1,
        toggle: () => setOthersOpen((open) => !open),
      },
    ],
    [
      othersOpen,
      partitioned,
      recentOpen,
      showRecently,
      showRecommended,
      showStarred,
      visibleSectionCount,
    ],
  );

  const createInfo = useMemo<CreateInfo | null>(() => {
    if (!allowCreate) return null;
    const raw = query.trim();
    if (!raw) return null;
    const batch = parseTagBatch(raw).map(normalizeLabelName).filter(Boolean);
    if (batch.length > 1)
      return { kind: "batch", labels: batch, label: batch.join(", ") };
    const slash = raw.indexOf("/");
    if (slash >= 0) {
      const group = normalizeLabelName(raw.slice(0, slash));
      const label = normalizeLabelName(raw.slice(slash + 1));
      if (!group || !label) return null;
      return { kind: "group", group, label };
    }
    const label = normalizeLabelName(raw);
    if (!label || tagsByLower.has(label.toLowerCase())) return null;
    return { kind: "plain", label };
  }, [allowCreate, query, tagsByLower]);

  const showTree = list && !needle;
  const recommendedRows = useMemo<TagPickerRow[]>(
    () =>
      showTree && showRecommended
        ? partitioned.recommended.map((tag) => ({
            id: `recommended-${tag.id}`,
            kind: "tag",
            tag,
            depth: 0,
          }))
        : [],
    [partitioned.recommended, showRecommended, showTree],
  );
  const listRows = useMemo<TagPickerRow[]>(() => {
    if (!list) return [];
    if (needle) {
      const starts = (tag: TagRow) =>
        Number(tag.name.toLowerCase().startsWith(needle));
      return matching
        .toSorted((a, b) => starts(b) - starts(a) || byName(a, b))
        .map((tag) => ({ id: `tag-${tag.id}`, kind: "tag", tag }));
    }
    const tagsById = new Map(tags.map((tag) => [tag.id, tag]));
    const grouped = new Set<string>();
    const result: TagPickerRow[] = [];
    const sortedGroups = groups.toSorted(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
    for (const group of sortedGroups) {
      const members = group.tagIds
        .flatMap((id) => tagsById.get(id) ?? [])
        .toSorted(byName);
      if (!members.length) continue;
      for (const tag of members) grouped.add(tag.id);
      result.push({ id: `group-${group.id}`, kind: "group", group });
      if (collapsedGroups.has(group.id)) continue;
      for (const tag of members)
        result.push({
          id: `tag-${group.id}-${tag.id}`,
          kind: "tag",
          tag,
          depth: 1,
        });
    }
    for (const tag of tags
      .filter((tag) => !grouped.has(tag.id))
      .toSorted(byName))
      result.push({ id: `tag-${tag.id}`, kind: "tag", tag, depth: 0 });
    return result;
  }, [collapsedGroups, groups, list, matching, needle, tags]);

  const rows = useMemo<readonly TagPickerRow[]>(() => {
    const tagRows: readonly TagPickerRow[] = list
      ? [...recommendedRows, ...listRows]
      : sections.flatMap((section) =>
          section.open
            ? section.items.map((tag) => ({
                id: `tag-${tag.id}`,
                kind: "tag" as const,
                tag,
              }))
            : [],
        );
    return placeCreateOptionLast(
      tagRows,
      createInfo
        ? {
            id: `create-${createInfo.label}`,
            kind: "create" as const,
            create: createInfo,
          }
        : null,
    );
  }, [createInfo, list, listRows, recommendedRows, sections]);
  const lastRow = rows.at(-1);
  const createRow = lastRow?.kind === "create" ? lastRow : null;

  async function commitCreate(info: CreateInfo) {
    if (creating) return;
    setCreating(true);
    setError(null);
    try {
      const label = info.label;
      if (info.kind === "batch") {
        for (const item of info.labels) {
          const lower = item.toLowerCase();
          const existed = tagsByLower.has(lower);
          if (!existed) await tagOperations.create("tag", item);
          if (!appliedKeys?.has(lower))
            await onToggle(item, { created: !existed });
        }
        setQuery("");
        return;
      }
      const existed = tagsByLower.has(label.toLowerCase());
      if (!existed) await tagOperations.create("tag", label);
      if (info.kind === "group") {
        const group = groups.find(
          (candidate) =>
            candidate.name.toLowerCase() === info.group.toLowerCase(),
        );
        if (!group) await tagOperations.create("group", info.group);
        await tagOperations.addToGroup(label, group?.name ?? info.group);
      }
      await onToggle(label, { created: !existed });
      setQuery("");
    } catch (cause) {
      setError(errorCopy(cause, "Couldn't create the tag. Try again."));
    } finally {
      setCreating(false);
    }
  }

  async function toggleTag(name: string) {
    setError(null);
    try {
      await onToggle(name);
    } catch (cause) {
      setError(errorCopy(cause, "Couldn't update the tag. Try again."));
    }
  }

  function toggleGroup(id: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function activate(row: TagPickerRow) {
    if (row.kind === "create") void commitCreate(row.create);
    else if (row.kind === "group") toggleGroup(row.group.id);
    else void toggleTag(row.tag.name);
  }

  const cursor = usePickerCursor({
    items: rows,
    getId: rowId,
    columns: list ? 1 : gridColumns(gridSize),
    onActivate: activate,
    onHorizontalKey: (key, row) => {
      if (!showTree) return false;
      if (row.kind !== "group") return true;
      const open = !collapsedGroups.has(row.group.id);
      if (key === "ArrowLeft" ? open : !open) toggleGroup(row.group.id);
      return true;
    },
  });

  return {
    query,
    setQuery,
    error,
    needle,
    list,
    showTree,
    matching,
    groupNamesByTag,
    collapsedGroups,
    sections,
    createInfo,
    createRow,
    recommendedRows,
    listRows,
    cursor,
  };
}
