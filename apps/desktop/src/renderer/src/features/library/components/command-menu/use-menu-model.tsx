import { IconFolder, IconLayers, IconMagnifier } from "@pond/icons";
import { useMemo } from "react";
import { selectLibraryNav } from "@/features/library/components/folder-sidebar/navigation";
import { useFolders } from "@/features/library/state/folders";
import { libraryHeader } from "@/features/library/state/library-header";
import {
  savedViews,
  useSavedViews,
} from "@/features/library/state/saved-views";
import {
  resetFilters,
  searchCurrentView,
  setSearchInput,
} from "@/features/library/state/view-store";
import { useRecents } from "@/features/saves";
import type { Save } from "@/features/saves/types";
import type { SaveLookup } from "@/features/search";
import { COMMANDS } from "./commands";
import { useContextEntries } from "./context-entries";
import { buildModel, rankEntries } from "./rank";
import { addToFolder, saveActions } from "./save-actions";
import { SaveThumb } from "./save-thumb";
import { MIN_SCORE } from "./score";
import { saveDetail, saveLabel } from "./search";
import type { MenuEntry, MenuPage } from "./types";
import { useSavesById } from "./use-saves-by-id";
import { useViewScope, type ViewScope } from "./use-view-scope";

const RECENT_LIMIT = 5;
const ROOT_LIMITS = { Folders: 5, "Saved Views": 5 };
const PAGE_LIMITS = { "": 50 };
const KEYWORD_SAVE_WEIGHT = 0.95;
/** Lifts Saves from the view you're on above equally good matches elsewhere in the Library. */
const IN_VIEW_BOOST = 0.04;
const SEARCHING = { label: "Searching", busy: true };
const NO_RESULTS = { label: "No results found", busy: false };

const VIEWS_PAGE: MenuPage = {
  kind: "views",
  key: "views",
  title: "Apply Saved View",
};

const COMMAND_ENTRIES: readonly MenuEntry[] = COMMANDS.map((command) => {
  const Icon = command.icon;
  return {
    id: `command:${command.id}`,
    group: command.group,
    label: command.label,
    keywords: [command.detail, command.keywords].filter(Boolean).join(" "),
    icon: <Icon aria-hidden />,
    shortcut: command.shortcut,
    run: command.run,
  };
});

const APPLY_VIEW_ENTRY: MenuEntry = {
  id: "command:apply-saved-view",
  group: "Navigate",
  label: "Apply Saved View",
  keywords: "smart folder filter",
  icon: <IconLayers aria-hidden />,
  page: () => VIEWS_PAGE,
};

function saveEntry(
  save: Save,
  options: {
    id: string;
    group: string;
    floor?: number;
    weight?: number;
    onOpenSave: (id: string) => void;
  },
): MenuEntry {
  return {
    id: options.id,
    group: options.group,
    label: saveLabel(save),
    tall: true,
    noun: "Save",
    detail: saveDetail(save),
    icon: <SaveThumb save={save} />,
    scoreFloor: options.floor,
    scoreWeight: options.weight,
    actions: () => saveActions(save, options.onOpenSave),
    run: () => options.onOpenSave(save.id),
  };
}

function searchLibraryEntry(query: string, scope: ViewScope | null): MenuEntry {
  return {
    id: "search:library",
    group: "Search",
    label: scope ? `Search ${scope.name}` : "Search Library",
    detail: query,
    icon: <IconMagnifier aria-hidden />,
    run: () => {
      if (scope) {
        searchCurrentView();
        setSearchInput([], query, query);
      } else {
        resetFilters();
        setSearchInput([], query, query);
        selectLibraryNav({ kind: "all" });
      }
      libraryHeader.focusSearch();
    },
  };
}

interface ModelInput {
  pathname: string;
  query: string;
  page: MenuPage | null;
  lookup: SaveLookup;
  onOpenSave: (id: string) => void;
}

/** Ranks everything the menu can show for one query, so every group updates in the same render. */
export function useMenuModel({
  pathname,
  query,
  page,
  lookup,
  onOpenSave,
}: ModelInput) {
  const folderRows = useFolders();
  const views = useSavedViews();
  const recents = useRecents();
  const contextEntries = useContextEntries(pathname, Boolean(query));
  const scope = useViewScope(pathname);

  const recentIds = useMemo(
    () => recents.slice(0, RECENT_LIMIT * 2).map((entry) => entry.saveId),
    [recents],
  );
  const recentSaves = useSavesById(page || query ? [] : recentIds);
  const hitIds = useMemo(() => lookup.hits.map((hit) => hit.id), [lookup.hits]);
  const hitSaves = useSavesById(hitIds);

  const folderEntries = useMemo<MenuEntry[]>(
    () =>
      folderRows.map((folder) => ({
        id: `folder:${folder.id}`,
        group: "Folders",
        label: folder.name,
        icon: <IconFolder aria-hidden />,
        run: () => selectLibraryNav({ kind: "folder", id: folder.id }),
      })),
    [folderRows],
  );

  const viewEntries = useMemo<MenuEntry[]>(
    () =>
      views
        .filter((view) => view.kind !== "group")
        .map((view) => ({
          id: `view:${view.id}`,
          group: "Saved Views",
          label: view.name,
          icon: <IconMagnifier aria-hidden />,
          run: () => {
            selectLibraryNav({ kind: "all" });
            savedViews.select(view.id);
          },
        })),
    [views],
  );

  const saveEntries = useMemo<MenuEntry[]>(() => {
    const via = new Map(lookup.hits.map((hit) => [hit.id, hit.via]));
    const inView = new Set(scope?.pick(hitSaves).map((save) => save.id));
    return hitSaves.map((save, rank) => {
      const local = inView.has(save.id);
      const boost = local ? IN_VIEW_BOOST : 0;
      return saveEntry(save, {
        id: `save:${save.id}`,
        group: local && scope ? `In ${scope.name}` : "Saves",
        onOpenSave,
        ...(via.get(save.id) === "semantic"
          ? { floor: MIN_SCORE + 0.01 + boost - rank * 0.0005, weight: 0 }
          : {
              floor: MIN_SCORE + 0.06 + boost - rank * 0.004,
              weight: KEYWORD_SAVE_WEIGHT + boost,
            }),
      });
    });
  }, [hitSaves, lookup.hits, onOpenSave, scope]);

  const recentEntries = useMemo<MenuEntry[]>(
    () =>
      recentSaves.slice(0, RECENT_LIMIT).map((save) =>
        saveEntry(save, {
          id: `recent:${save.id}`,
          group: "Recent",
          onOpenSave,
        }),
      ),
    [recentSaves, onOpenSave],
  );

  const pageEntries = useMemo<MenuEntry[]>(() => {
    if (!page) return [];
    if (page.kind === "actions") return [...page.entries];
    if (page.kind === "views") {
      return viewEntries.map((entry) => ({ ...entry, group: "" }));
    }
    return folderRows.map((folder) => ({
      id: `add-to-folder:${folder.id}`,
      group: "",
      label: folder.name,
      icon: <IconFolder aria-hidden />,
      run: () => void addToFolder(page.saveIds, folder.id),
    }));
  }, [page, viewEntries, folderRows]);

  const model = useMemo(() => {
    if (page) {
      const ranked = rankEntries(pageEntries, query);
      return buildModel({
        ranked,
        byScore: Boolean(query),
        limits: PAGE_LIMITS,
        status: ranked.length === 0 ? NO_RESULTS : null,
      });
    }
    const hasViews = viewEntries.length > 0;
    const entries: MenuEntry[] = query
      ? [
          ...contextEntries,
          ...COMMAND_ENTRIES,
          ...(hasViews ? [APPLY_VIEW_ENTRY] : []),
          ...folderEntries,
          ...viewEntries,
          ...saveEntries,
        ]
      : [
          ...contextEntries,
          ...recentEntries,
          ...COMMAND_ENTRIES,
          ...(hasViews ? [APPLY_VIEW_ENTRY] : []),
        ];
    const ranked = rankEntries(entries, query);
    const waiting = lookup.searching && saveEntries.length === 0;
    return buildModel({
      ranked,
      byScore: Boolean(query),
      limits: ROOT_LIMITS,
      status: !query
        ? null
        : waiting
          ? SEARCHING
          : ranked.length === 0
            ? NO_RESULTS
            : null,
      footer: query
        ? { entry: searchLibraryEntry(query, scope), score: 0, ranges: [] }
        : null,
    });
  }, [
    page,
    pageEntries,
    query,
    contextEntries,
    recentEntries,
    folderEntries,
    viewEntries,
    saveEntries,
    lookup.searching,
    scope,
  ]);

  const resultCount = model.entries.length - (model.footer ? 1 : 0);
  return { model, resultCount };
}
