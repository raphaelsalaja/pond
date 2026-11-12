import { IconChevronDown as ChevronDown } from "@pond/icons";
import { PickerPanel } from "@pond/ui";
import type { ReactNode } from "react";
import {
  type TagGroupRow,
  useTagGroups,
} from "@/features/tags/state/tag-groups";
import { type TagRow, useTags } from "@/features/tags/state/tags";
import { TagMenuRow } from "./row";
import styles from "./styles.module.css";
import type { TagPickerRow } from "./types";
import { useTagMenu } from "./use-tag-menu";

interface TagMenuProps {
  appliedKeys?: ReadonlySet<string>;
  mixedKeys?: ReadonlySet<string>;
  counts?: ReadonlyMap<string, number>;
  onToggle: (
    name: string,
    options?: { created?: boolean },
  ) => void | Promise<void>;
  allowCreate?: boolean;
  placeholder?: string;
  emptyLabel?: ReactNode;
  recommendedNames?: readonly string[];
  layout?: "list" | "grid";
  gridSize?: "sm" | "md" | "lg";
  showStarred?: boolean;
  showRecently?: boolean;
  showRecommended?: boolean;
  showCounts?: boolean;
  pinned?: boolean;
}

export interface TagMenuViewProps extends TagMenuProps {
  tags: readonly TagRow[];
  groups: readonly TagGroupRow[];
}

export function TagMenu(props: TagMenuProps) {
  const tags = useTags();
  const groups = useTagGroups();
  return <TagMenuView {...props} tags={tags} groups={groups} />;
}

export function TagMenuView({
  tags,
  groups,
  appliedKeys,
  mixedKeys,
  counts,
  onToggle,
  allowCreate = false,
  placeholder = "Search…",
  emptyLabel = "No tags yet.",
  recommendedNames = [],
  layout = "list",
  gridSize = "md",
  showStarred = true,
  showRecently = true,
  showRecommended = true,
  showCounts = true,
  pinned = false,
}: TagMenuViewProps) {
  const {
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
  } = useTagMenu({
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
  });

  function renderGroup(row: Extract<TagPickerRow, { kind: "group" }>) {
    return (
      <TagMenuRow.Group
        {...cursor.getItemProps(row)}
        key={row.id}
        group={row.group}
        open={!collapsedGroups.has(row.group.id)}
      />
    );
  }

  function renderTag(
    tag: TagRow,
    row: Extract<TagPickerRow, { kind: "tag" }> = {
      id: `tag-${tag.id}`,
      kind: "tag",
      tag,
    },
  ) {
    const lower = tag.name.toLowerCase();
    const groupNames = needle ? groupNamesByTag.get(tag.id) : undefined;
    return (
      <TagMenuRow.Tag
        {...cursor.getItemProps(row)}
        key={row.id}
        tag={tag}
        depth={row.depth}
        nested={showTree && row.depth !== undefined}
        applied={appliedKeys?.has(lower) ?? false}
        mixed={mixedKeys?.has(lower) ?? false}
        count={counts?.get(lower) ?? tag.usageCount}
        showCount={showCounts}
        group={
          groupNames?.find((name) => name.toLowerCase().includes(needle)) ??
          groupNames?.[0]
        }
      />
    );
  }

  return (
    <PickerPanel.Surface
      className={styles.root}
      data-layout={layout}
      data-grid-size={gridSize}
      data-pinned={pinned ? "" : undefined}
    >
      <PickerPanel.Header>
        <PickerPanel.Search
          {...cursor.inputProps}
          aria-label="Search Tags"
          value={query}
          placeholder={placeholder}
          autoFocus
          onChange={(event) => setQuery(event.target.value)}
        />
      </PickerPanel.Header>

      <PickerPanel.Collection
        id={cursor.collectionId}
        className={styles.list}
        role={showTree ? "tree" : "listbox"}
        aria-label="Tags"
        aria-multiselectable="true"
      >
        {list ? (
          <>
            {recommendedRows.length ? (
              <PickerPanel.Group role="group" aria-label="Recommended">
                <PickerPanel.GroupLabel>Recommended</PickerPanel.GroupLabel>
                {recommendedRows.map((row) =>
                  row.kind === "tag" ? renderTag(row.tag, row) : null,
                )}
              </PickerPanel.Group>
            ) : null}
            {recommendedRows.length && listRows.length ? (
              <PickerPanel.GroupLabel>All Tags</PickerPanel.GroupLabel>
            ) : null}
            {listRows.map((row) =>
              row.kind === "group"
                ? renderGroup(row)
                : row.kind === "tag"
                  ? renderTag(row.tag, row)
                  : null,
            )}
          </>
        ) : null}

        {list
          ? null
          : sections.map((section) =>
              section.items.length ? (
                <PickerPanel.Group
                  key={section.id}
                  className={styles.group}
                  role="group"
                  aria-label={`${section.label}, ${section.items.length}`}
                >
                  {section.collapsible ? (
                    <PickerPanel.SectionButton
                      className={styles.section}
                      aria-expanded={section.open}
                      tabIndex={-1}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={section.toggle}
                    >
                      <span>
                        {section.label} ({section.items.length})
                      </span>
                      <ChevronDown size={12} aria-hidden="true" />
                    </PickerPanel.SectionButton>
                  ) : (
                    <PickerPanel.GroupLabel>
                      {section.label} ({section.items.length})
                    </PickerPanel.GroupLabel>
                  )}
                  {section.open
                    ? section.items.map((tag) => renderTag(tag))
                    : null}
                </PickerPanel.Group>
              ) : null,
            )}

        {createRow ? (
          <TagMenuRow.Create
            {...cursor.getItemProps(createRow)}
            create={createRow.create}
          />
        ) : null}

        {error ? (
          <PickerPanel.Empty role="alert">{error}</PickerPanel.Empty>
        ) : null}
        {!matching.length && !createInfo ? (
          <PickerPanel.Empty>
            {needle ? "No matches." : emptyLabel}
          </PickerPanel.Empty>
        ) : null}
      </PickerPanel.Collection>
    </PickerPanel.Surface>
  );
}
