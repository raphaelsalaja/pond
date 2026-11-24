import { addSavesToCanvas, canvases, createCanvas } from "@/features/canvas";
import { selectLibraryNav } from "@/features/library/components/folder-sidebar/navigation";
import {
  lastUsedFolderId,
  rememberFolderDestinations,
} from "@/features/library/lib/recent-folders";
import { showSavesInLibrary } from "@/features/library/lib/show-saves";
import { openConversionDialog } from "@/features/library/state/conversion-dialog";
import { openDuplicateReview } from "@/features/library/state/duplicate-review";
import { openFolderPicker } from "@/features/library/state/folder-picker";
import { saveFolderPresentation } from "@/features/library/state/folder-presentation";
import { folders } from "@/features/library/state/folders";
import {
  getLibraryNav,
  libraryChrome,
} from "@/features/library/state/library-chrome";
import { openRenameDialog } from "@/features/library/state/rename-dialog";
import {
  resetFilters,
  setQuery,
  setVisualProbe,
} from "@/features/library/state/view-store";
import { registerSaveLibraryBridge } from "@/features/saves/lib/library-bridge";
import { closeSave } from "@/features/saves/lib/save-nav";
import { getAppHistory } from "@/shared/lib/app-router";
import { pathForLibraryNav } from "@/shared/lib/library-nav";

registerSaveLibraryBridge({
  getNav: getLibraryNav,
  showNav: (nav) => getAppHistory()?.push(pathForLibraryNav(nav)),
  resetFilters,
  openTaggedItems: (name) => selectLibraryNav({ kind: "tag", name }),
  showPost: (key) => selectLibraryNav({ kind: "post", key }),
  closeDetails: () => libraryChrome.setDetailsOpen(false),
  openFolderPicker,
  openRename: openRenameDialog,
  openConversion: (ids, fileIndex, mode) =>
    openConversionDialog(ids, fileIndex, mode),
  openDuplicateReview,
  findSimilarColor: (color) => {
    setQuery({
      combinator: "and",
      rules: [{ field: "color", operator: "near", value: color }],
    });
    closeSave();
  },
  showMatching: (predicate) => {
    setQuery({ combinator: "and", rules: [predicate] });
    closeSave();
  },
  showSaves: showSavesInLibrary,
  showLibrary: (nav, predicate) => {
    resetFilters();
    selectLibraryNav(nav);
    if (predicate) {
      setQuery({ combinator: "and", rules: [predicate] });
    }
  },
  setVisualProbe: ({ id, label }) =>
    setVisualProbe({ kind: "saveId", id, label }),
  foldersForSave: (id) => folders.forSave(id),
  foldersSnapshot: () => folders.snapshot(),
  lastUsedFolderId,
  rememberFolderDestinations,
  refreshFolders: () => folders.refresh(),
  startEditingFolder: (id) => folders.startEditing(id),
  saveFolderPresentation,
  canvasesSnapshot: () => canvases.snapshot(),
  addSavesToCanvas: (canvasId, ids) => addSavesToCanvas(canvasId, ids),
  createCanvasWithSaves: (ids) => createCanvas(ids),
});
