import { IconBookmark, IconFilterOff } from "@pond/icons";
import { isPredicate } from "@pond/schema/filters/types";
import type { FieldId, Predicate } from "@pond/schema/filters/types";
import { Button, SplitButton, Tooltip } from "@pond/ui";
import { useMemo } from "react";
import { useFolders } from "@/features/library/state/folders";
import { libraryHeader } from "@/features/library/state/library-header";
import {
  updateLocalFilters,
  useActiveViewId,
  useFilterQuery,
  useSemanticQuery,
  useVisualProbe,
} from "@/features/library/state/view-store";
import { useNlFacets } from "@/features/search";
import {
  accountChipLabel,
  accountDisplayName,
  accountRefsFromSync,
} from "@/features/search/query";
import { BrandTile } from "@/features/sources";
import { useTagGroups, useTags } from "@/features/tags";
import { FilterToolbar } from "@/shared/components/filter-toolbar";
import { FolderIcon } from "@/shared/lib/folder-icons";
import { usePrefs } from "@/shared/state/prefs";
import { AddFilter } from "./add";
import { AppliedFilters } from "./applied";
import { FilterCategory } from "./category";
import { CustomizeFilters } from "./customize";
import { choiceOptions, presetOptions } from "./options";
import type { FilterOption } from "./options";
import { SemanticChip, VisualChip } from "./overlay";
import { sourceOptions } from "./source-options";
import { filterToolbar, useFilterToolbar } from "./toolbar-state";
import type { FilterChipId, OverlayId } from "./toolbar-state";
import { clearFilters, saveFilterView, saveViewLabel } from "./view-actions";

interface FilterChoices {
  tags: Array<FilterOption>;
  folder: Array<FilterOption>;
  source: Array<FilterOption>;
  creator: Array<FilterOption>;
  account: Array<FilterOption>;
}

interface FilterBarData {
  tags: ReadonlyArray<{ name: string }>;
  tagGroups: ReadonlyArray<{ name: string; tagNames: ReadonlyArray<string> }>;
  folders: ReadonlyArray<{
    id: string;
    name: string;
    parentId?: string | null;
    color?: string | null;
    icon?: string;
  }>;
  facets: ReturnType<typeof useNlFacets>;
  refs: ReturnType<typeof accountRefsFromSync>;
}

function useFilterBarData(): FilterBarData {
  const tags = useTags();
  const tagGroups = useTagGroups();
  const folders = useFolders();
  const facets = useNlFacets();
  const [sync] = usePrefs("sync");
  const [folderViews] = usePrefs("folderViews");
  return useMemo(
    () => ({
      tags,
      tagGroups,
      folders: folders.map((folder) => ({
        ...folder,
        icon: folderViews[folder.id]?.icon,
      })),
      facets,
      refs: accountRefsFromSync(sync),
    }),
    [facets, folderViews, folders, sync, tagGroups, tags],
  );
}

export function FilterToggle() {
  return <FilterToggleView {...useFilterBarData()} />;
}

export function FilterBar() {
  return <FilterBarView {...useFilterBarData()} />;
}

export function FilterToggleView(data: FilterBarData) {
  const { open, layout } = useFilterToolbar();
  const query = useFilterQuery();
  const semantic = useSemanticQuery();
  const visual = useVisualProbe();
  const rows = useMemo(() => query.rules.filter(isPredicate), [query.rules]);
  const choices = useMemo(() => filterChoices(data, rows), [data, rows]);
  if (layout === "applied") {
    const applied: Array<FilterChipId> = [
      ...(visual ? (["visual"] as const) : []),
      ...(semantic ? (["semantic"] as const) : []),
      ...new Set(
        rows.map((row) => (row.field === "height" ? "width" : row.field)),
      ),
    ];
    const props = { choices, rows, onChange: updateLocalFilters, applied };
    return applied.length ? (
      <SplitButton.Root variant="ghost" size="sm" aria-label="Filters">
        <AppliedFilters {...props} />
        <AddFilter {...props} segment />
      </SplitButton.Root>
    ) : (
      <AddFilter {...props} />
    );
  }
  return (
    <FilterToolbar.Toggle
      variant="ghost"
      open={open}
      active={rows.length > 0 || Boolean(semantic) || Boolean(visual)}
      controlsId="library-filter-toolbar"
      onToggle={() => {
        libraryHeader.closePopover();
        filterToolbar.setOpen(!open);
      }}
    />
  );
}

function filterChoices(
  { tags, tagGroups, folders, facets, refs }: FilterBarData,
  rows: ReadonlyArray<Predicate>,
): FilterChoices {
  const selectedSources = rows
    .filter((row) => row.field === "source")
    .flatMap((row) =>
      (Array.isArray(row.value) ? row.value : [row.value]).map(String),
    );
  const tagGroupOf = new Map<string, string>();
  for (const group of tagGroups) {
    for (const name of group.tagNames) {
      if (!tagGroupOf.has(name.toLowerCase())) {
        tagGroupOf.set(name.toLowerCase(), group.name);
      }
    }
  }
  const folderNames = new Map(
    folders.map((folder) => [folder.id, folder.name]),
  );
  return {
    tags: choiceOptions(
      "tags",
      tags.map((tag) => ({ label: tag.name, value: tag.name.toLowerCase() })),
    ).map((option) => ({
      ...option,
      crumb: tagGroupOf.get(option.label.toLowerCase()),
    })),
    folder: choiceOptions(
      "folder",
      folders.map((folder) => ({
        label: folder.name,
        value: folder.id.toLowerCase(),
      })),
    ).map((option, index) => {
      const folder = folders[index];
      return {
        ...option,
        crumb: folder?.parentId ? folderNames.get(folder.parentId) : undefined,
        icon: <FolderIcon name={folder?.icon} color={folder?.color} />,
      };
    }),
    source: sourceOptions([
      ...new Set([...facets.sources, ...selectedSources]),
    ]),
    creator: choiceOptions(
      "creator",
      facets.creators.map((value) => ({ label: value, value })),
    ),
    account: choiceOptions(
      "account",
      refs.map((ref) => ({
        label: accountChipLabel(ref.id, refs),
        value: ref.id.toLowerCase(),
      })),
    ).map((option, index) => {
      const ref = refs[index];
      return ref
        ? {
            ...option,
            shortLabel: accountDisplayName(ref),
            icon: <BrandTile source={ref.source} size={16} rounding="full" />,
          }
        : option;
    }),
  };
}

export function FilterBarView(data: FilterBarData) {
  const { open, layout, pinned, overlays } = useFilterToolbar();
  const query = useFilterQuery();
  const semantic = useSemanticQuery();
  const visual = useVisualProbe();
  const activeViewId = useActiveViewId();
  const rows = useMemo(() => query.rules.filter(isPredicate), [query.rules]);
  const choices = useMemo(() => filterChoices(data, rows), [data, rows]);
  const fieldChoices: Partial<Record<FieldId, Array<FilterOption>>> = choices;
  if (layout === "applied") {
    return null;
  }
  const activeFields = rows.map((row) =>
    row.field === "height" ? "width" : row.field,
  );
  const fields = [
    ...new Set(
      [...pinned, ...activeFields].map((field) =>
        field === "height" ? "width" : field,
      ),
    ),
  ];
  const shownOverlays: Array<OverlayId> = [
    ...(overlays.includes("visual") || visual ? (["visual"] as const) : []),
    ...(overlays.includes("semantic") || semantic
      ? (["semantic"] as const)
      : []),
  ];
  const chips: Array<FilterChipId> = [
    ...fields.filter((field) => field === "color"),
    ...shownOverlays,
    ...fields.filter((field) => field !== "color"),
  ];
  const hasActiveFilters =
    rows.length > 0 || Boolean(semantic) || Boolean(visual);
  const saveLabel = saveViewLabel(activeViewId);
  return (
    <FilterToolbar.Bar
      open={open}
      id="library-filter-toolbar"
      label="Library Filters"
      actions={
        <>
          <CustomizeFilters
            choices={choices}
            activeFields={activeFields}
            semanticActive={Boolean(semantic)}
            visualActive={Boolean(visual)}
          />
          <Tooltip label={saveLabel} side="bottom">
            <Button
              icon
              size="sm"
              variant="ghost"
              aria-label={saveLabel}
              onClick={() => saveFilterView(activeViewId)}
            >
              <IconBookmark />
            </Button>
          </Tooltip>
          <Tooltip label="Clear Filters" side="bottom">
            <Button
              icon
              size="sm"
              variant="ghost"
              aria-label="Clear Filters"
              disabled={!hasActiveFilters}
              onClick={clearFilters}
            >
              <IconFilterOff />
            </Button>
          </Tooltip>
        </>
      }
    >
      {chips.map((chip) =>
        chip === "semantic" ? (
          <SemanticChip key="semantic" />
        ) : chip === "visual" ? (
          <VisualChip key="visual" />
        ) : (
          <FilterCategory
            key={chip}
            field={chip}
            options={fieldChoices[chip] ?? presetOptions(chip)}
            rows={rows}
            onChange={updateLocalFilters}
          />
        ),
      )}
    </FilterToolbar.Bar>
  );
}
