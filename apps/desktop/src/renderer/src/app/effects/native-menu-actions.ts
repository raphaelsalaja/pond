import { FIELD_IDS } from "@pond/schema/filters/meta";
import type { FieldId } from "@pond/schema/filters/types";
import type { MenuActionId, MenuActionSource } from "@shared/constants";
import { filterToolbar } from "@/features/library/components/filter-menu/toolbar-state";
import {
  exportDebugReport,
  runNewAction,
} from "@/features/library/components/new-menu/actions";
import {
  type SearchScope,
  type SearchView,
  searchViewFor,
} from "@/features/library/lib/search-view";
import { commandMenu } from "@/features/library/state/command-menu";
import { libraryChrome } from "@/features/library/state/library-chrome";
import { libraryHeader } from "@/features/library/state/library-header";
import { savedViews } from "@/features/library/state/saved-views";
import {
  getViewState,
  reseedRandomSort,
  resetFilters,
  searchAllSaves,
  searchCurrentView,
  setIncludeSubfolders,
  setSort,
} from "@/features/library/state/view-store";
import { copyId, openTagPicker } from "@/features/saves/lib/actions";
import { addSavesToLastUsedFolder } from "@/features/saves/lib/folder-actions";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import { parseMode } from "@/features/saves/lib/list";
import {
  isSaveCollectionPath,
  listPathForLocation,
} from "@/features/saves/lib/list-path";
import { rateSaves } from "@/features/saves/lib/rating";
import { REVERSE_SEARCH_ENGINES } from "@/features/saves/lib/reverse-image-search";
import { selectResults } from "@/features/saves/lib/select-results";
import {
  clearTagsForSelection,
  copyFilePathsForSelection,
  copyFilesForSelection,
  copyIdsForSelection,
  copyNamesForSelection,
  copyTagsForSelection,
  copyUrlsForSelection,
  exportSelectionCsv,
  exportSelectionFiles,
  pasteTagsForSelection,
  reverseImageSearchForSelection,
} from "@/features/saves/lib/selection";
import { pool } from "@/features/saves/state/pool";
import { primarySelection, selection } from "@/features/saves/state/selection";
import { requestUpdateCheck } from "@/features/settings/update-check";
import { getAppRouter } from "@/shared/lib/app-router";
import { isEditableTarget } from "@/shared/lib/editable-target";
import { openSettings } from "@/shared/lib/open-settings";
import { notify } from "@/shared/lib/toast";
import { whatsNewDialog } from "@/shared/state/whats-new";

function selectedIds(): string[] {
  const selected = [...selection.snapshot()];
  if (selected.length > 0) return selected;
  const primary = primarySelection.get();
  return primary ? [primary] : [];
}

function requireSelection(): string[] {
  const ids = selectedIds();
  if (ids.length === 0) {
    notify({
      id: "native-menu-selection",
      title: "Select Saves first",
    });
  }
  return ids;
}

function selectIds(ids: readonly string[]): void {
  selection.set(ids);
  selection.setCursor(ids[0] ?? null);
  if (!ids.length) selection.clear();
  const first = ids[0] ?? null;
  primarySelection.set(first);
  if (first) selection.setAnchor(first);
}

function selectAllSaves(): void {
  void selectResults("all");
}

function invertSaveSelection(): void {
  void selectResults("invert");
}

async function exportPackage(kind: "eagle" | "pond"): Promise<void> {
  const ids = requireSelection();
  if (ids.length === 0) return;
  if (kind === "eagle") {
    const result = await window.pond.query("saves.exportEaglePackage", { ids });
    if (!result.ok && result.reason !== "cancelled") {
      notify({
        id: "native-menu-export",
        title: result.error || "Couldn't export Eagle package",
      });
    }
    return;
  }
  const result = await window.pond.query("saves.exportPackage", {
    ids,
  });
  if (!result.ok && result.reason !== "cancelled") {
    notify({
      id: "native-menu-export",
      title: result.error || "Couldn't export Pond package",
    });
  }
}

async function addToLastFolder(): Promise<void> {
  const ids = requireSelection();
  if (ids.length === 0) return;
  await addSavesToLastUsedFolder(ids);
}

async function removeFromCurrentFolder(): Promise<void> {
  const ids = requireSelection();
  if (ids.length === 0) return;
  const nav = saveLibraryBridge.getNav();
  if (nav.kind !== "folder") {
    notify({
      id: "native-menu-folder",
      title: "Open a folder first",
    });
    return;
  }
  await window.pond.query("folders.assign", {
    saveIds: ids,
    addIds: [],
    removeIds: [nav.id],
  });
  await saveLibraryBridge.refreshFolders();
}

function openFilter(field: FieldId): void {
  filterToolbar.setPinned(field, true);
  filterToolbar.setOpen(true);
}

function currentSearchView(): SearchView | null {
  const pathname = getAppRouter()?.state.location.pathname;
  if (!pathname || !isSaveCollectionPath(pathname)) return null;
  return searchViewFor(
    parseMode(listPathForLocation(pathname)) ?? "library",
    libraryChrome.getState().nav,
  );
}

function searchAllSavesInPlace(): void {
  const view = currentSearchView();
  if (view && view.kind !== "trash") {
    searchAllSaves(view);
    return;
  }
  searchCurrentView();
  libraryChrome.setNav({ kind: "all" });
  getAppRouter()?.history.push("/");
}

function openSearch(scope: SearchScope): void {
  if (scope === "all") searchAllSavesInPlace();
  else searchCurrentView();
  libraryHeader.focusSearch();
}

function addTag(): void {
  const ids = requireSelection();
  if (ids.length === 0) return;
  openTagPicker();
}

function createSmartFolderGroup(): void {
  savedViews.openEditor({ kind: "group" });
}

function findField(id: MenuActionId): FieldId | null {
  if (!id.startsWith("find.filter.")) return null;
  const value = id.slice("find.filter.".length);
  return FIELD_IDS.find((field) => field === value) ?? null;
}

function reverseImageEngine(id: MenuActionId): string | null {
  if (!id.startsWith("find.reverse-image.")) return null;
  const value = id.slice("find.reverse-image.".length);
  return (
    REVERSE_SEARCH_ENGINES.find((engine) => engine.key === value)?.key ?? null
  );
}

function ratingValue(id: MenuActionId): number | null {
  if (!id.startsWith("organize.rating.")) return null;
  const value = Number.parseInt(id.slice("organize.rating.".length), 10);
  return Number.isInteger(value) && value >= 0 && value <= 5 ? value : null;
}

export function shouldIgnoreMenuAction(
  source: MenuActionSource,
  id?: MenuActionId,
): boolean {
  if (source !== "accelerator" || !isEditableTarget()) return false;
  return id !== "library.search";
}

export function handleNativeMenuAction(id: MenuActionId): boolean {
  const field = findField(id);
  if (field) {
    openFilter(field);
    return true;
  }
  const engine = reverseImageEngine(id);
  if (engine) {
    const ids = requireSelection();
    if (ids.length > 0) void reverseImageSearchForSelection(ids, engine);
    return true;
  }
  const rating = ratingValue(id);
  if (rating != null) {
    const ids = requireSelection();
    if (ids.length > 0) void rateSaves(ids, rating);
    return true;
  }

  switch (id) {
    case "selection.select-all":
      selectAllSaves();
      return true;
    case "selection.clear":
      selectIds([]);
      return true;
    case "selection.invert":
      invertSaveSelection();
      return true;
    case "library.new-smart-folder-group":
      createSmartFolderGroup();
      return true;
    case "save.export-files": {
      const ids = requireSelection();
      if (ids.length > 0) void exportSelectionFiles(ids);
      return true;
    }
    case "save.export-converted": {
      const ids = requireSelection();
      if (ids.length > 0) saveLibraryBridge.openConversion(ids, 0);
      return true;
    }
    case "save.export-eagle-package":
      void exportPackage("eagle");
      return true;
    case "save.export-pond-package":
      void exportPackage("pond");
      return true;
    case "save.export-csv": {
      const ids = requireSelection();
      if (ids.length > 0) void exportSelectionCsv(ids);
      return true;
    }
    case "save.copy-name": {
      const ids = requireSelection();
      if (ids.length > 0) void copyNamesForSelection(ids);
      return true;
    }
    case "save.copy-file-path": {
      const ids = requireSelection();
      if (ids.length > 0) void copyFilePathsForSelection(ids);
      return true;
    }
    case "save.copy-pond-link": {
      const ids = requireSelection();
      if (ids.length > 0)
        void window.pond.query("saves.copyInternalLinks", { ids });
      return true;
    }
    case "save.copy-tags":
    case "organize.copy-tags": {
      const ids = requireSelection();
      if (ids.length > 0) void copyTagsForSelection(ids);
      return true;
    }
    case "save.paste-tags":
    case "organize.paste-tags": {
      const ids = requireSelection();
      if (ids.length > 0) void pasteTagsForSelection(ids);
      return true;
    }
    case "save.copy-media": {
      const ids = requireSelection();
      if (ids.length > 0) void copyFilesForSelection(ids);
      return true;
    }
    case "save.copy-url": {
      const ids = requireSelection();
      if (ids.length > 0) void copyUrlsForSelection(ids);
      return true;
    }
    case "save.copy-id": {
      const ids = requireSelection();
      if (ids.length > 1) void copyIdsForSelection(ids);
      else if (ids[0]) void copyId(ids[0]);
      return true;
    }
    case "save.remove-current-folder":
      void removeFromCurrentFolder();
      return true;
    case "find.search":
      openSearch("current");
      return true;
    case "find.search-all":
      openSearch("all");
      return true;
    case "find.go-to-folder":
      commandMenu.open();
      return true;
    case "find.add-to-folders":
    case "organize.add-to-folders": {
      const ids = requireSelection();
      if (ids.length > 0) saveLibraryBridge.openFolderPicker(ids);
      return true;
    }
    case "find.add-to-last-folder":
    case "organize.add-to-last-folder":
      void addToLastFolder();
      return true;
    case "find.filters.toggle":
      filterToolbar.toggle();
      return true;
    case "find.filters.reset":
      resetFilters();
      return true;
    case "find.visual-search": {
      const id = requireSelection()[0];
      const save = id ? pool.get(id) : null;
      if (save) {
        saveLibraryBridge.setVisualProbe({
          id: save.id,
          label: save.title?.trim() || save.id,
        });
      }
      return true;
    }
    case "organize.add-tag":
      addTag();
      return true;
    case "organize.clear-tags": {
      const ids = requireSelection();
      if (ids.length > 0) void clearTagsForSelection(ids);
      return true;
    }
    case "view.random": {
      const state = getViewState();
      setSort({ key: "random", dir: state.sortDir });
      reseedRandomSort();
      return true;
    }
    case "view.subfolders.toggle": {
      const state = getViewState();
      setIncludeSubfolders(!state.includeSubfolders);
      return true;
    }
    case "help.shortcuts":
      openSettings("shortcuts");
      return true;
    case "updates.check":
      requestUpdateCheck();
      return true;
    case "help.whats-new":
      whatsNewDialog.open();
      return true;
    case "help.export-debug-report":
      void runNewAction(exportDebugReport);
      return true;
    default:
      return false;
  }
}
