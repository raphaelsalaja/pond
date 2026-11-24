import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { useSaves } from "@/features/saves/pool";
import { useTagGroups } from "@/features/tags/state/tag-groups";
import type { TagGroupRow } from "@/features/tags/state/tag-groups";
import { useTags } from "@/features/tags/state/tags";
import type { TagRow } from "@/features/tags/state/tags";
import { EMPTY_STATS } from "../components/manager/lib/types";
import type { GroupStats, TagsRowData } from "../components/manager/lib/types";

export function useTagsData() {
  const tags = useTags();
  const groups = useTagGroups();
  const saves = useSaves();

  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const [toggles, setToggles] = useState<Map<string, boolean>>(new Map());

  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const s of saves) {
      if (s.deletedAt) {
        continue;
      }
      for (const t of s.tags) {
        const k = t.toLowerCase();
        c.set(k, (c.get(k) ?? 0) + 1);
      }
    }
    return c;
  }, [saves]);

  const countFor = useCallback(
    (name: string) => counts.get(name.toLowerCase()) ?? 0,
    [counts],
  );

  const tagsById = useMemo(() => {
    const m = new Map<string, TagRow>();
    for (const t of tags) {
      m.set(t.id, t);
    }
    return m;
  }, [tags]);

  const taggedIds = useMemo(() => {
    const set = new Set<string>();
    for (const g of groups) {
      for (const id of g.tagIds) {
        set.add(id);
      }
    }
    return set;
  }, [groups]);

  const groupStats = useMemo(() => {
    const m = new Map<string, GroupStats>();
    for (const g of groups) {
      const members = g.tagIds
        .map((id) => tagsById.get(id))
        .filter((t): t is TagRow => Boolean(t));
      m.set(g.id, { members });
    }
    return m;
  }, [groups, tagsById]);

  const groupOptions = useMemo(() => groups.map((g) => g.name), [groups]);
  const groupSummaries = useMemo(
    () =>
      groups.map((group) => ({
        id: group.id,
        name: group.name,
        count: groupStats.get(group.id)?.members.length ?? 0,
      })),
    [groups, groupStats],
  );
  const ungroupedTotal = tags.length - taggedIds.size;
  const starredTotal = tags.filter((tag) => tag.starred).length;
  const needle = deferredQ.trim().toLowerCase();

  const data = useMemo<Array<TagsRowData>>(() => {
    const groupRows: Array<TagsRowData> = groups
      .map((group) => {
        const stats = groupStats.get(group.id) ?? EMPTY_STATS;
        const children = stats.members
          .filter((t) =>
            needle ? t.name.toLowerCase().includes(needle) : true,
          )
          .map<TagsRowData>((tag) => ({
            id: `${group.id}:${tag.id}`,
            kind: "tag",
            tag,
            inGroup: group.name,
            saves: countFor(tag.name),
          }))
          .sort((a, b) => {
            if (a.kind !== "tag" || b.kind !== "tag") {
              return 0;
            }
            return a.tag.name.localeCompare(b.tag.name, undefined, {
              sensitivity: "base",
            });
          });
        return {
          id: group.id,
          kind: "group" as const,
          group,
          stats,
          children,
        };
      })
      .filter((row) => {
        if (row.kind !== "group") {
          return true;
        }
        if (!needle) {
          return true;
        }
        if (row.group.name.toLowerCase().includes(needle)) {
          return true;
        }
        return row.group.tagNames.some((n) => n.toLowerCase().includes(needle));
      })
      .sort((a, b) =>
        a.kind === "group" && b.kind === "group"
          ? a.group.name.localeCompare(b.group.name, undefined, {
              sensitivity: "base",
            })
          : 0,
      );

    const tagRows: Array<TagsRowData> = tags
      .filter((t) => !taggedIds.has(t.id))
      .filter((t) => (needle ? t.name.toLowerCase().includes(needle) : true))
      .map((tag) => ({
        id: tag.id,
        kind: "tag" as const,
        tag,
        inGroup: null,
        saves: countFor(tag.name),
      }))
      .sort((a, b) =>
        a.tag.name.localeCompare(b.tag.name, undefined, {
          sensitivity: "base",
        }),
      );

    return [...groupRows, ...tagRows];
  }, [tags, groups, groupStats, taggedIds, needle, countFor]);

  const isExpanded = useCallback(
    (g: TagGroupRow) =>
      toggles.has(g.id) ? Boolean(toggles.get(g.id)) : !g.collapsed,
    [toggles],
  );

  const expandedIds = useMemo<Array<string>>(() => {
    if (needle) {
      return groups.map((g) => g.id);
    }
    return groups.filter((g) => isExpanded(g)).map((g) => g.id);
  }, [needle, groups, isExpanded]);

  const onToggleExpand = useCallback(
    (id: string, next: boolean) => {
      const g = groups.find((x) => x.id === id);
      if (!g) {
        return;
      }
      setToggles((prev) => new Map(prev).set(id, next));
      void window.pond.query("tagGroups.update", {
        name: g.name,
        patch: { collapsed: !next },
      });
    },
    [groups],
  );

  const tagNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of data) {
      if (row.kind === "tag") {
        m.set(row.id, row.tag.name);
      } else {
        for (const child of row.children) {
          if (child.kind === "tag") {
            m.set(child.id, child.tag.name);
          }
        }
      }
    }
    return m;
  }, [data]);

  const namesFromIds = useCallback(
    (ids: Array<string>) => {
      const set = new Set<string>();
      for (const id of ids) {
        const name = tagNameById.get(id);
        if (name) {
          set.add(name);
        }
      }
      return [...set];
    },
    [tagNameById],
  );

  return {
    q,
    setQ,
    data,
    expandedIds,
    onToggleExpand,
    namesFromIds,
    groupOptions,
    groupSummaries,
    ungroupedTotal,
    starredTotal,
    total: tags.length,
  };
}
