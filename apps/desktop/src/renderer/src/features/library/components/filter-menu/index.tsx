import { IconBookmark, IconFilterOff } from "@pond/icons";
import { isPredicate, type Predicate } from "@pond/schema/filters/types";
import { Button, Tooltip } from "@pond/ui";
import { useMemo } from "react";
import { useFolders } from "@/features/library/state/folders";
import { libraryHeader } from "@/features/library/state/library-header";
import { savedViews } from "@/features/library/state/saved-views";
import {
  setSemanticQuery,
  setVisualProbe,
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
import { errorCopy } from "@/shared/lib/error-copy";
import { FolderIcon } from "@/shared/lib/folder-icons";
import { notify } from "@/shared/lib/toast";
import { usePrefs } from "@/shared/state/prefs";
import { AddFilter } from "./add";
import { FilterCategory } from "./category";
import { CustomizeFilters } from "./customize";
import { choiceOptions, type FilterOption, presetOptions } from "./options";
import { SemanticChip, VisualChip } from "./overlay";
import { sourceOptions } from "./source-options";
import {
  type FilterChipId,
  filterToolbar,
  type OverlayId,
  useFilterToolbar,
} from "./toolbar-state";

interface FilterChoices {
  tags: FilterOption[];
  folder: FilterOption[];
  source: FilterOption[];
  creator: FilterOption[];
  account: FilterOption[];
}

interface FilterBarData {
  tags: readonly { name: string }[];
  tagGroups: readonly { name: string; tagNames: readonly string[] }[];
  folders: readonly {
    id: string;
    name: string;
    parentId?: string | null;
    color?: string | null;
    icon?: string;
  }[];
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
    return (
      <AddFilter
        choices={choices}
        rows={rows}
        onChange={updateLocalFilters}
        applied={[
          ...rows.map((row) => (row.field === "height" ? "width" : row.field)),
          ...(visual ? (["visual"] as const) : []),
          ...(semantic ? (["semantic"] as const) : []),
        ]}
      />
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
  rows: readonly Predicate[],
): FilterChoices {
  const selectedSources = rows
    .filter((row) => row.field === "source")
    .flatMap((row) =>
      (Array.isArray(row.value) ? row.value : [row.value]).map(String),
    );
  const tagGroupOf = new Map<string, string>();
  for (const group of tagGroups)
    for (const name of group.tagNames)
      if (!tagGroupOf.has(name.toLowerCase()))
        tagGroupOf.set(name.toLowerCase(), group.name);
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
            icon: <BrandTile source={ref.source} size={16} />,
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
  const activeFields = rows.map((row) =>
    row.field === "height" ? "width" : row.field,
  );
  const appliedLayout = layout === "applied";
  const fields = [
    ...new Set(
      (appliedLayout ? activeFields : [...pinned, ...activeFields]).map(
        (field) => (field === "height" ? "width" : field),
      ),
    ),
  ];
  const shownOverlays: OverlayId[] = appliedLayout
    ? [
        ...(visual ? (["visual"] as const) : []),
        ...(semantic ? (["semantic"] as const) : []),
      ]
    : [
        ...(overlays.includes("visual") || visual ? (["visual"] as const) : []),
        ...(overlays.includes("semantic") || semantic
          ? (["semantic"] as const)
          : []),
      ];
  const chips: FilterChipId[] = appliedLayout
    ? [...shownOverlays, ...fields]
    : [
        ...fields.filter((field) => field === "color"),
        ...shownOverlays,
        ...fields.filter((field) => field !== "color"),
      ];
  const choices = useMemo(() => filterChoices(data, rows), [data, rows]);

  const apply = (next: Predicate[]) => {
    updateLocalFilters(next);
  };
  const hasActiveFilters =
    rows.length > 0 || Boolean(semantic) || Boolean(visual);
  const saveView = () => {
    if (activeViewId) {
      void savedViews.updateCurrent(activeViewId).catch((error) =>
        notify({
          id: "save-filter-view",
          title: "Couldn't update the saved view",
          description: errorCopy(error, "Try again."),
        }),
      );
      return;
    }
    void savedViews
      .create({ kind: "saved_view", name: "Untitled" })
      .then((view) => savedViews.startEditing(view.id))
      .catch((error) =>
        notify({
          id: "save-filter-view",
          title: "Couldn't save the view",
          description: errorCopy(error, "Try again."),
        }),
      );
  };
  const clearAll = () => {
    updateLocalFilters([]);
    setSemanticQuery(null);
    setVisualProbe(null);
  };
  const saveLabel = activeViewId ? "Update View" : "Save View";
  const viewActions = (
    <>
      <Tooltip label={saveLabel} side="bottom">
        <Button
          icon
          size="sm"
          variant="ghost"
          aria-label={saveLabel}
          onClick={saveView}
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
          onClick={clearAll}
        >
          <IconFilterOff />
        </Button>
      </Tooltip>
    </>
  );
  return (
    <FilterToolbar.Bar
      open={appliedLayout ? chips.length > 0 : open}
      id="library-filter-toolbar"
      label="Library Filters"
      wrap={appliedLayout}
      actions={
        appliedLayout ? (
          hasActiveFilters ? (
            viewActions
          ) : null
        ) : (
          <>
            <CustomizeFilters
              choices={choices}
              activeFields={activeFields}
              semanticActive={Boolean(semantic)}
              visualActive={Boolean(visual)}
            />
            {viewActions}
          </>
        )
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
            options={
              Object.entries(choices).find(([field]) => field === chip)?.[1] ??
              presetOptions(chip)
            }
            rows={rows}
            onChange={apply}
          />
        ),
      )}
    </FilterToolbar.Bar>
  );
}
