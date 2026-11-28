import { FIELD_IDS } from "@pond/schema/filters/meta";
import type { FieldId } from "@pond/schema/filters/types";
import type { MenuActionId, MenuActionSource } from "@shared/constants";
import { filterToolbar } from "@/features/library/components/filter-menu/toolbar-state";
import {
  exportDebugReport,
  runNewAction,
} from "@/features/library/components/new-menu/actions";
import { gridTakes } from "@/features/library/lib/grid-commands";
import { searchViewFor } from "@/features/library/lib/search-view";
import type {
  SearchScope,
  SearchView,
} from "@/features/library/lib/search-view";
import { libraryHeader } from "@/features/library/state/library-header";
import { savedViews } from "@/features/library/state/saved-views";
import {
  currentSort,
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
import {
  markProcessed,
  waitingInInbox,
} from "@/features/saves/lib/inbox-actions";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import { rateSaves } from "@/features/saves/lib/rating";
import { REVERSE_SEARCH_ENGINES } from "@/features/saves/lib/reverse-image-search";
import {
  requireSaveTargets,
  routeOwnsSaveSelection,
} from "@/features/saves/lib/save-targets";
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
import { toggleFavorite } from "@/features/saves/lib/triage";
import { pool } from "@/features/saves/state/pool";
import { primarySelection, selection } from "@/features/saves/state/selection";
import { openSnoozeDialog } from "@/features/saves/state/snooze-dialog";
import { requestUpdateCheck } from "@/features/settings/update-check";
import { getAppHistory, getAppRouter } from "@/shared/lib/app-router";
import { isEditableTarget } from "@/shared/lib/editable-target";
import { openSettings } from "@/shared/lib/open-settings";
import { currentRouteMeta } from "@/shared/lib/route-meta";
import { notify } from "@/shared/lib/toast";
import { whatsNewDialog } from "@/shared/state/whats-new";

function selectIds(ids: ReadonlyArray<string>): void {
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
  const ids = requireSaveTargets();
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
  const ids = requireSaveTargets();
  if (ids.length === 0) return;
  await addSavesToLastUsedFolder(ids);
}

async function removeFromCurrentFolder(): Promise<void> {
  const ids = requireSaveTargets();
  if (ids.length === 0) return;
  const nav = saveLibraryBridge.getNav();
  if (nav?.kind !== "folder") {
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
  if (!gridTakes("search")) return;
  filterToolbar.setPinned(field, true);
  filterToolbar.setOpen(true);
}

function currentSearchView(): SearchView | null {
  const meta = currentRouteMeta();
  if (meta?.surface !== "grid") return null;
  return searchViewFor(meta.nav);
}

function searchAllSavesInPlace(): void {
  const view = currentSearchView();
  if (view && view.kind !== "trash") {
    searchAllSaves(view);
    return;
  }
  const q = getViewState().q;
  const router = getAppRouter();
  if (!router) {
    return;
  }
  getAppHistory()?.push(`/${router.options.stringifySearch(q ? { q } : {})}`);
}

/** Search All Saves leaves for All when no grid is showing; the current view has nowhere to go, so it is dropped. */
function openSearch(scope: SearchScope): void {
  if (scope === "all") searchAllSavesInPlace();
  else if (gridTakes("search")) searchCurrentView();
  else return;
  libraryHeader.focusSearch();
}

function addTag(): void {
  const ids = requireSaveTargets();
  if (ids.length === 0) return;
  openTagPicker(ids);
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
    const ids = requireSaveTargets();
    if (ids.length > 0) void reverseImageSearchForSelection(ids, engine);
    return true;
  }
  const rating = ratingValue(id);
  if (rating !== null) {
    const ids = requireSaveTargets();
    if (ids.length > 0) void rateSaves(ids, rating);
    return true;
  }

  switch (id) {
    case "selection.select-all":
      if (routeOwnsSaveSelection()) selectAllSaves();
      return true;
    case "selection.clear":
      if (routeOwnsSaveSelection()) selectIds([]);
      return true;
    case "selection.invert":
      if (routeOwnsSaveSelection()) invertSaveSelection();
      return true;
    case "library.new-smart-folder-group":
      createSmartFolderGroup();
      return true;
    case "save.export-files": {
      const ids = requireSaveTargets();
      if (ids.length > 0) void exportSelectionFiles(ids);
      return true;
    }
    case "save.export-converted": {
      const ids = requireSaveTargets();
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
      const ids = requireSaveTargets();
      if (ids.length > 0) void exportSelectionCsv(ids);
      return true;
    }
    case "save.copy-name": {
      const ids = requireSaveTargets();
      if (ids.length > 0) void copyNamesForSelection(ids);
      return true;
    }
    case "save.copy-file-path": {
      const ids = requireSaveTargets();
      if (ids.length > 0) void copyFilePathsForSelection(ids);
      return true;
    }
    case "save.copy-pond-link": {
      const ids = requireSaveTargets();
      if (ids.length > 0) {
        void window.pond.query("saves.copyInternalLinks", { ids });
      }
      return true;
    }
    case "organize.copy-tags": {
      const ids = requireSaveTargets();
      if (ids.length > 0) void copyTagsForSelection(ids);
      return true;
    }
    case "organize.paste-tags": {
      const ids = requireSaveTargets();
      if (ids.length > 0) void pasteTagsForSelection(ids);
      return true;
    }
    case "save.copy-media": {
      const ids = requireSaveTargets();
      if (ids.length > 0) void copyFilesForSelection(ids);
      return true;
    }
    case "save.copy-url": {
      const ids = requireSaveTargets();
      if (ids.length > 0) void copyUrlsForSelection(ids);
      return true;
    }
    case "save.copy-id": {
      const ids = requireSaveTargets();
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
    case "organize.add-to-folders": {
      const ids = requireSaveTargets();
      if (ids.length > 0) saveLibraryBridge.openFolderPicker(ids);
      return true;
    }
    case "organize.add-to-multiple-folders":
    case "organize.add-to-recent-folder": {
      const ids = requireSaveTargets();
      if (ids.length > 0) {
        saveLibraryBridge.openFolderPicker(
          ids,
          id === "organize.add-to-recent-folder" ? "recent" : "multiple",
        );
      }
      return true;
    }
    case "organize.favorite": {
      const ids = requireSaveTargets();
      if (ids.length > 0) void toggleFavorite(ids);
      return true;
    }
    case "organize.add-to-last-folder":
      void addToLastFolder();
      return true;
    case "find.filters.toggle":
      if (gridTakes("search")) filterToolbar.toggle();
      return true;
    case "find.filters.reset":
      if (gridTakes("search")) resetFilters();
      return true;
    case "find.visual-search": {
      const id = requireSaveTargets()[0];
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
    case "organize.mark-processed": {
      const ids = waitingInInbox(requireSaveTargets());
      if (ids.length > 0) void markProcessed(ids);
      return true;
    }
    case "organize.snooze": {
      const ids = waitingInInbox(requireSaveTargets());
      if (ids.length > 0) openSnoozeDialog(ids);
      return true;
    }
    case "organize.clear-tags": {
      const ids = requireSaveTargets();
      if (ids.length > 0) void clearTagsForSelection(ids);
      return true;
    }
    case "view.random": {
      if (!gridTakes("view")) return true;
      setSort({ key: "random", dir: currentSort().dir });
      reseedRandomSort();
      return true;
    }
    case "view.subfolders.toggle": {
      if (!gridTakes("view")) return true;
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
