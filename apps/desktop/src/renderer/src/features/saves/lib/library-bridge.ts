import type { Predicate } from "@pond/schema/filters/types";
import type { LibraryNav } from "@/shared/lib/library-nav";

export interface SaveFolderReference {
  id: string;
  name: string;
  parentId?: string | null;
}

export interface DuplicateReviewRequest {
  saveId?: string;
  ids?: readonly string[];
}

/** `recent` lists recent destinations for one-key assignment; `multiple` opens straight into staged selection. */
export type FolderPickerMode = "all" | "multiple" | "recent";

export interface SaveCanvasReference {
  id: string;
  name: string;
  saveIds: readonly string[];
}

export interface SaveLibraryBridge {
  getNav(): LibraryNav | null;
  /** Opens the collection fresh, without the current search. */
  showNav(nav: LibraryNav): void;
  resetFilters(): void;
  openTaggedItems(name: string): void;
  showPost(key: string): void;
  closeDetails(): void;
  openFolderPicker(ids: readonly string[], mode?: FolderPickerMode): void;
  openRename(ids: readonly string[]): void;
  openConversion(
    ids: readonly string[],
    fileIndex: number,
    mode?: "files" | "converted",
  ): void;
  openDuplicateReview(request: DuplicateReviewRequest): void;
  findSimilarColor(color: string): void;
  showMatching(predicate: Predicate): void;
  showSaves(ids: readonly string[], folderId?: string): void;
  showLibrary(nav: LibraryNav, predicate?: Predicate): void;
  setVisualProbe(input: { id: string; label: string }): void;
  foldersForSave(id: string): readonly SaveFolderReference[];
  foldersSnapshot(): readonly SaveFolderReference[];
  lastUsedFolderId(): string | null;
  rememberFolderDestinations(ids: string[]): void;
  refreshFolders(): Promise<void>;
  startEditingFolder(id: string): void;
  saveFolderPresentation(
    folderId: string,
    patch: { pinnedIds?: string[]; coverSaveId?: string | null },
  ): Promise<void>;
  canvasesSnapshot(): readonly SaveCanvasReference[];
  addSavesToCanvas(canvasId: string, ids: readonly string[]): void;
  createCanvasWithSaves(ids: readonly string[]): void;
}

function unavailable(): never {
  throw new Error("Save Library bridge is not registered.");
}

let current: SaveLibraryBridge = {
  getNav: unavailable,
  showNav: unavailable,
  resetFilters: unavailable,
  openTaggedItems: unavailable,
  showPost: unavailable,
  closeDetails: unavailable,
  openFolderPicker: unavailable,
  openRename: unavailable,
  openConversion: unavailable,
  openDuplicateReview: unavailable,
  findSimilarColor: unavailable,
  showMatching: unavailable,
  showSaves: unavailable,
  showLibrary: unavailable,
  setVisualProbe: unavailable,
  foldersForSave: unavailable,
  foldersSnapshot: unavailable,
  lastUsedFolderId: unavailable,
  rememberFolderDestinations: unavailable,
  refreshFolders: unavailable,
  startEditingFolder: unavailable,
  saveFolderPresentation: unavailable,
  canvasesSnapshot: unavailable,
  addSavesToCanvas: unavailable,
  createCanvasWithSaves: unavailable,
};

export function registerSaveLibraryBridge(bridge: SaveLibraryBridge): void {
  current = bridge;
}

export const saveLibraryBridge: SaveLibraryBridge = {
  getNav: () => current.getNav(),
  showNav: (nav) => current.showNav(nav),
  resetFilters: () => current.resetFilters(),
  openTaggedItems: (name) => current.openTaggedItems(name),
  showPost: (key) => current.showPost(key),
  closeDetails: () => current.closeDetails(),
  openFolderPicker: (ids, mode) => current.openFolderPicker(ids, mode),
  openRename: (ids) => current.openRename(ids),
  openConversion: (ids, fileIndex, mode) =>
    current.openConversion(ids, fileIndex, mode),
  openDuplicateReview: (request) => current.openDuplicateReview(request),
  findSimilarColor: (color) => current.findSimilarColor(color),
  showMatching: (predicate) => current.showMatching(predicate),
  showSaves: (ids, folderId) => current.showSaves(ids, folderId),
  showLibrary: (nav, predicate) => current.showLibrary(nav, predicate),
  setVisualProbe: (input) => current.setVisualProbe(input),
  foldersForSave: (id) => current.foldersForSave(id),
  foldersSnapshot: () => current.foldersSnapshot(),
  lastUsedFolderId: () => current.lastUsedFolderId(),
  rememberFolderDestinations: (ids) => current.rememberFolderDestinations(ids),
  refreshFolders: () => current.refreshFolders(),
  startEditingFolder: (id) => current.startEditingFolder(id),
  saveFolderPresentation: (folderId, patch) =>
    current.saveFolderPresentation(folderId, patch),
  canvasesSnapshot: () => current.canvasesSnapshot(),
  addSavesToCanvas: (canvasId, ids) => current.addSavesToCanvas(canvasId, ids),
  createCanvasWithSaves: (ids) => current.createCanvasWithSaves(ids),
};
