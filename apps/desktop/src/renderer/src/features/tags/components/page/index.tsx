import { IconFolder, IconPlus, IconStar, IconTag } from "@pond/icons";
import { Button, Empty, Input, Tooltip } from "@pond/ui";
import { DataTable } from "@pond/ui/data-table";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { TagsBulkActionBar } from "@/features/tags/components/manager/bulk-actions";
import { DraftRow } from "@/features/tags/components/manager/draft-row";
import { TagItem } from "@/features/tags/components/manager/item";
import { tagsColumns } from "@/features/tags/components/manager/lib/columns";
import { TagsTableContext } from "@/features/tags/components/manager/lib/context";
import type { TagsRowData } from "@/features/tags/components/manager/lib/types";
import { TagPicker } from "@/features/tags/components/picker";
import { useTagCreation } from "@/features/tags/hooks/use-tag-creation";
import { useTagsData } from "@/features/tags/hooks/use-tag-manager";
import { tagOperations } from "@/features/tags/operations/tag-client";
import {
  tagCreation,
  useTagCreationRequest,
} from "@/features/tags/state/creation";
import { tagsScope, useTagsScope } from "@/features/tags/state/tags-scope";
import { MatchesEmpty } from "@/shared/components/matches-empty";
import { SearchChrome } from "@/shared/components/search-chrome";
import { findScrollParent } from "@/shared/lib/dom";
import { usePrefs } from "@/shared/state/prefs";
import { TagSortMenu } from "./sort-menu";
import styles from "./styles.module.css";

type TagData = Extract<TagsRowData, { kind: "tag" }>;

interface AlphabetGroup {
  letter: string;
  rows: TagData[];
}

function alphabetKey(name: string): string {
  const first = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .charAt(0)
    .toUpperCase();
  return /^[A-Z]$/.test(first) ? first : "#";
}

function groupAlphabetically(
  rows: TagData[],
  direction: "asc" | "desc",
): AlphabetGroup[] {
  const grouped = new Map<string, TagData[]>();
  for (const row of rows) {
    const key = alphabetKey(row.tag.name);
    const group = grouped.get(key);
    if (group) group.push(row);
    else grouped.set(key, [row]);
  }
  const order = direction === "asc" ? 1 : -1;
  return [...grouped]
    .sort(([a], [b]) => a.localeCompare(b) * order)
    .map(([letter, items]) => ({
      letter,
      rows: items.toSorted(
        (a, b) =>
          a.tag.name.localeCompare(b.tag.name, undefined, {
            sensitivity: "base",
          }) * order,
      ),
    }));
}

type IndexLine =
  | { kind: "header"; key: string; letter: string; count: number }
  | { kind: "tags"; key: string; rows: TagData[]; groupEnd: boolean };

/** Must match the .grid breakpoints in styles.module.css. */
function readColumns(): number {
  if (matchMedia("(max-width: 680px)").matches) return 1;
  if (matchMedia("(max-width: 900px)").matches) return 2;
  return 3;
}

function useGridColumns(): number {
  const [columns, setColumns] = useState(readColumns);
  useEffect(() => {
    const queries = ["(max-width: 680px)", "(max-width: 900px)"].map((query) =>
      matchMedia(query),
    );
    const update = () => setColumns(readColumns());
    for (const query of queries) query.addEventListener("change", update);
    return () => {
      for (const query of queries) query.removeEventListener("change", update);
    };
  }, []);
  return columns;
}

function chunkTags(
  rows: TagData[],
  columns: number,
  closesGroup: boolean,
): IndexLine[] {
  const lines: IndexLine[] = [];
  for (let start = 0; start < rows.length; start += columns) {
    const chunk = rows.slice(start, start + columns);
    lines.push({
      kind: "tags",
      key: chunk[0]?.id ?? String(start),
      rows: chunk,
      groupEnd: closesGroup && start + columns >= rows.length,
    });
  }
  return lines;
}

/**
 * Every TagItem carries two menus, so mounting thousands at once stalls the page; the focused line stays mounted to keep a rename draft.
 * @remarks The scroller comes from the list, since a ref on the parent <main> is unattached at the first measure.
 */
function VirtualTagIndex({ lines }: { lines: IndexLine[] }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const pinned =
    focusedKey === null
      ? -1
      : lines.findIndex((line) => line.key === focusedKey);
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const onFocusIn = (event: FocusEvent) => {
      const item =
        event.target instanceof Element
          ? event.target.closest(`.${styles.item}`)
          : null;
      setFocusedKey(
        lines[Number(item?.getAttribute("data-index"))]?.key ?? null,
      );
    };
    const onFocusOut = (event: FocusEvent) => {
      if (
        !(event.relatedTarget instanceof Node) ||
        !list.contains(event.relatedTarget)
      )
        setFocusedKey(null);
    };
    list.addEventListener("focusin", onFocusIn);
    list.addEventListener("focusout", onFocusOut);
    return () => {
      list.removeEventListener("focusin", onFocusIn);
      list.removeEventListener("focusout", onFocusOut);
    };
  }, [lines]);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const list = listRef.current;
    const scroller = findScrollParent(list);
    if (!list || !scroller) return;
    const next =
      list.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    setScrollMargin((prev) => (prev === next ? prev : next));
  });
  const virtual = useVirtualizer({
    count: lines.length,
    getScrollElement: () => findScrollParent(listRef.current),
    estimateSize: (index) => (lines[index]?.kind === "header" ? 44 : 34),
    getItemKey: (index) => lines[index]?.key ?? index,
    scrollMargin,
    overscan: 10,
    rangeExtractor: (range) => {
      const indexes = defaultRangeExtractor(range);
      if (pinned < 0 || indexes.includes(pinned)) return indexes;
      return [...indexes, pinned].sort((a, b) => a - b);
    },
  });

  return (
    <div
      ref={listRef}
      className={styles.virtual}
      style={{ height: virtual.getTotalSize() }}
    >
      {virtual.getVirtualItems().map((item) => {
        const line = lines[item.index];
        if (!line) return null;
        return (
          <div
            key={item.key}
            ref={virtual.measureElement}
            data-index={item.index}
            className={styles.item}
            style={{
              transform: `translateY(${item.start - virtual.options.scrollMargin}px)`,
            }}
          >
            {line.kind === "header" ? (
              <header
                className={styles["letter-header"]}
                data-first={item.index === 0 || undefined}
              >
                <h2>{line.letter}</h2>
                <span>({line.count})</span>
              </header>
            ) : (
              <div
                className={styles.grid}
                data-group-end={line.groupEnd || undefined}
              >
                {line.rows.map((row) => (
                  <TagItem key={row.id} row={row} variant="index" />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function TagsPage() {
  const {
    q,
    setQ,
    data,
    namesFromIds,
    groupOptions,
    groupSummaries,
    total,
  } = useTagsData();
  const [allTags, patchAllTags] = usePrefs("allTags");
  const scope = useTagsScope();
  const setScope = tagsScope.set;
  const { creating, startCreate, cancelCreate, saveCreate } = useTagCreation();
  const creationRequest = useTagCreationRequest();
  const [creationGroup, setCreationGroup] = useState<string | null>(null);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const cancelDescriptionRef = useRef(false);
  const clearRef = useRef<() => void>(() => {});
  const columns = useGridColumns();

  useEffect(() => {
    if (creationRequest.token === 0) return;
    const request = tagCreation.takeRequest();
    if (!request) return;
    const group = groupSummaries.find((candidate) => candidate.id === scope);
    setScope(request.kind === "group" ? "all" : group ? scope : "ungrouped");
    setCreationGroup(request.kind === "tag" ? (group?.name ?? null) : null);
    startCreate(request.kind);
  }, [creationRequest, groupSummaries, scope, startCreate]);
  const contextValue = useMemo(
    () => ({
      groups: groupOptions,
      tags: [
        ...new Set(
          data.flatMap((row) =>
            row.kind === "tag"
              ? [row.tag.name]
              : row.children.flatMap((child) =>
                  child.kind === "tag" ? [child.tag.name] : [],
                ),
          ),
        ),
      ],
    }),
    [data, groupOptions],
  );

  useEffect(() => {
    if (
      scope !== "all" &&
      scope !== "ungrouped" &&
      scope !== "starred" &&
      !groupSummaries.some((group) => group.id === scope)
    ) {
      setScope("all");
    }
  }, [scope, groupSummaries]);

  const groups = data.filter(
    (row): row is Extract<TagsRowData, { kind: "group" }> =>
      row.kind === "group",
  );
  const ungrouped = data.filter((row): row is TagData => row.kind === "tag");
  const activeGroupRow =
    scope === "all" || scope === "ungrouped" || scope === "starred"
      ? undefined
      : groups.find((group) => group.id === scope);
  const visibleRows = useMemo(() => {
    if (scope === "ungrouped") return ungrouped;
    if (scope === "starred") {
      return [
        ...groups.flatMap((group) => group.children),
        ...ungrouped,
      ].filter((row): row is TagData => row.kind === "tag" && row.tag.starred);
    }
    if (scope !== "all") {
      return (
        groups
          .find((group) => group.id === scope)
          ?.children.filter((row): row is TagData => row.kind === "tag") ?? []
      );
    }
    return [...groups.flatMap((group) => group.children), ...ungrouped].filter(
      (row): row is TagData => row.kind === "tag",
    );
  }, [groups, scope, ungrouped]);
  const orderedRows = useMemo(() => {
    const direction = allTags.sortDirection === "asc" ? 1 : -1;
    return visibleRows.toSorted((a, b) => {
      if (allTags.sort === "count")
        return (
          (a.saves - b.saves) * direction ||
          a.tag.name.localeCompare(b.tag.name)
        );
      if (allTags.sort === "recent")
        return (
          ((a.tag.lastUsedAt ?? 0) - (b.tag.lastUsedAt ?? 0)) * direction ||
          a.tag.name.localeCompare(b.tag.name)
        );
      return (
        a.tag.name.localeCompare(b.tag.name, undefined, {
          sensitivity: "base",
        }) * direction
      );
    });
  }, [allTags.sort, allTags.sortDirection, visibleRows]);
  const alphabet = useMemo(
    () => groupAlphabetically(orderedRows, allTags.sortDirection),
    [allTags.sortDirection, orderedRows],
  );
  const flatLines = useMemo(
    () => chunkTags(orderedRows, columns, false),
    [columns, orderedRows],
  );
  const indexLines = useMemo(
    () =>
      alphabet.flatMap((group): IndexLine[] => [
        {
          kind: "header",
          key: `letter:${group.letter}`,
          letter: group.letter,
          count: group.rows.length,
        },
        ...chunkTags(group.rows, columns, true),
      ]),
    [alphabet, columns],
  );

  useEffect(() => {
    cancelDescriptionRef.current = false;
    setDescriptionDraft(activeGroupRow?.group.description ?? "");
  }, [activeGroupRow?.group.description]);

  const scopeLabel =
    scope === "all"
      ? "All Tags"
      : scope === "ungrouped"
        ? "Uncategorized"
        : scope === "starred"
          ? "Starred"
          : (groupSummaries.find((group) => group.id === scope)?.name ??
            "All Tags");

  function beginCreate(kind: "tag" | "group") {
    setCreationGroup(null);
    startCreate(kind);
  }

  async function commitCreate(name: string) {
    const groupName = creationGroup;
    try {
      await saveCreate(name);
      if (groupName) await tagOperations.addToGroup(name, groupName);
    } finally {
      setCreationGroup(null);
    }
  }

  function commitGroupDescription() {
    const group = activeGroupRow?.group;
    if (!group || descriptionDraft.trim() === (group.description ?? "")) return;
    void window.pond.query("tagGroups.update", {
      name: group.name,
      patch: { description: descriptionDraft },
    });
  }

  return (
    <DataTable.Provider
      data={data}
      columns={tagsColumns}
      getRowId={(row) => row.id}
      getSubRows={(row) => (row.kind === "group" ? row.children : undefined)}
      expandCaret={false}
      onSelectionChange={() => {}}
      defaultSort={{ id: "name", desc: false }}
    >
      <div className={styles.page}>
        <SearchChrome.Root
          actions={
            <>
              {activeGroupRow ? (
                <TagPicker.Root
                  target={{ kind: "group", group: activeGroupRow.group }}
                >
                  <Tooltip label="Add Tags" side="bottom">
                    <TagPicker.Trigger
                      icon
                      variant="ghost"
                      size="sm"
                      aria-label={`Add Tags to ${activeGroupRow.group.name}`}
                    >
                      <IconPlus />
                    </TagPicker.Trigger>
                  </Tooltip>
                  <TagPicker.Content align="end" />
                </TagPicker.Root>
              ) : (
                <Tooltip label="New Tag" side="bottom">
                  <Button
                    icon
                    variant="ghost"
                    size="sm"
                    aria-label="New Tag"
                    onClick={() => beginCreate("tag")}
                  >
                    <IconPlus />
                  </Button>
                </Tooltip>
              )}
              <TagSortMenu
                sort={allTags.sort}
                direction={allTags.sortDirection}
                onChange={(sort, sortDirection) =>
                  void patchAllTags({ sort, sortDirection })
                }
              />
            </>
          }
        >
          <SearchChrome.Field
            value={q}
            onChange={(event) => setQ(event.target.value)}
            aria-label="Search Tags"
            data-tags-search=""
          />
        </SearchChrome.Root>

        <TagsTableContext value={contextValue}>
          <div className={styles.workspace}>
            <main className={styles.main} data-scroll-fade="vertical">
              {activeGroupRow ? (
                <section className={styles.detail}>
                  <Input.Root
                    className={styles.description}
                    size="sm"
                    variant="borderless"
                  >
                    <Input.Field
                      value={descriptionDraft}
                      placeholder="Add a description"
                      aria-label={`${activeGroupRow.group.name} description`}
                      onChange={(event) =>
                        setDescriptionDraft(event.target.value)
                      }
                      onFocus={() => {
                        cancelDescriptionRef.current = false;
                      }}
                      onBlur={() => {
                        if (cancelDescriptionRef.current) {
                          cancelDescriptionRef.current = false;
                          return;
                        }
                        commitGroupDescription();
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                        if (event.key === "Escape") {
                          cancelDescriptionRef.current = true;
                          setDescriptionDraft(
                            activeGroupRow.group.description ?? "",
                          );
                          event.currentTarget.blur();
                        }
                      }}
                    />
                  </Input.Root>
                </section>
              ) : null}

              {creating ? (
                <div className={styles.draft}>
                  <DraftRow
                    creating={creating}
                    onSave={commitCreate}
                    onFinish={cancelCreate}
                  />
                </div>
              ) : null}

              {(activeGroupRow || allTags.sort !== "name") &&
              orderedRows.length > 0 ? (
                <div className={styles.tags}>
                  <VirtualTagIndex lines={flatLines} />
                </div>
              ) : alphabet.length > 0 ? (
                <VirtualTagIndex lines={indexLines} />
              ) : total === 0 && !q ? (
                <Empty.Root className={styles.empty}>
                  <Empty.Media>
                    <IconTag size={14} />
                  </Empty.Media>
                  <Empty.Title>No tags yet</Empty.Title>
                  <Empty.Description>
                    Create your first tag to start organizing your library.
                  </Empty.Description>
                  <Empty.Action>
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => beginCreate("tag")}
                    >
                      New Tag
                    </Button>
                  </Empty.Action>
                </Empty.Root>
              ) : q ? (
                <div className={styles.matches}>
                  <MatchesEmpty query={q} onReset={() => setQ("")} />
                </div>
              ) : (
                <Empty.Root
                  className={styles["scope-empty"]}
                  role="status"
                  aria-live="polite"
                >
                  <Empty.Media>
                    {scope === "starred" ? (
                      <IconStar size={14} />
                    ) : scope === "ungrouped" ? (
                      <IconTag size={14} />
                    ) : (
                      <IconFolder size={14} />
                    )}
                  </Empty.Media>
                  <Empty.Title>No tags in {scopeLabel}</Empty.Title>
                  <Empty.Description>
                    {scope === "starred"
                      ? "Starred tags appear here."
                      : scope === "ungrouped"
                        ? "Tags that are not in a group appear here."
                        : `Add tags to ${scopeLabel} to see them here.`}
                  </Empty.Description>
                  <Empty.Action>
                    {activeGroupRow ? (
                      <TagPicker.Root
                        target={{
                          kind: "group",
                          group: activeGroupRow.group,
                        }}
                      >
                        <TagPicker.Trigger variant="primary" size="sm">
                          Add Tags
                        </TagPicker.Trigger>
                        <TagPicker.Content align="center" />
                      </TagPicker.Root>
                    ) : scope === "ungrouped" ? (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => beginCreate("tag")}
                      >
                        New Tag
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => setScope("all")}
                      >
                        View All Tags
                      </Button>
                    )}
                  </Empty.Action>
                </Empty.Root>
              )}
            </main>
          </div>
        </TagsTableContext>
      </div>
      <TagsBulkActionBar namesFromIds={namesFromIds} clearRef={clearRef} />
    </DataTable.Provider>
  );
}
