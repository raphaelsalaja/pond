import type { Predicate } from "@pond/schema/filters/types";
import type { LibraryNav } from "@/shared/lib/library-nav";

export interface SaveFolderReference {
  id: string;
  name: string;
  parentId?: string | null;
}

export interface DuplicateReviewRequest {
  saveId?: string;
  ids?: ReadonlyArray<string>;
}

/** `recent` lists recent destinations for one-key assignment; `multiple` opens straight into staged selection. */
export type FolderPickerMode = "all" | "multiple" | "recent";

export interface SaveCanvasReference {
  id: string;
  name: string;
  saveIds: ReadonlyArray<string>;
}

export interface SaveLibraryBridge {
  getNav(): LibraryNav | null;
  /** Opens the collection fresh, without the current search. */
  showNav(nav: LibraryNav): void;
  resetFilters(): void;
  openTaggedItems(name: string): void;
  showPost(key: string): void;
  closeDetails(): void;
  openFolderPicker(ids: ReadonlyArray<string>, mode?: FolderPickerMode): void;
  openRename(ids: ReadonlyArray<string>): void;
  openConversion(
    ids: ReadonlyArray<string>,
    fileIndex: number,
    mode?: "files" | "converted",
  ): void;
  openDuplicateReview(request: DuplicateReviewRequest): void;
  findSimilarColor(color: string): void;
  showMatching(predicate: Predicate): void;
  showSaves(ids: ReadonlyArray<string>, folderId?: string): void;
  showLibrary(nav: LibraryNav, predicate?: Predicate): void;
  setVisualProbe(input: { id: string; label: string }): void;
  foldersForSave(id: string): ReadonlyArray<SaveFolderReference>;
  foldersSnapshot(): ReadonlyArray<SaveFolderReference>;
  lastUsedFolderId(): string | null;
  rememberFolderDestinations(ids: Array<string>): void;
  refreshFolders(): Promise<void>;
  startEditingFolder(id: string): void;
  saveFolderPresentation(
    folderId: string,
    patch: { pinnedIds?: Array<string>; coverSaveId?: string | null },
  ): Promise<void>;
  canvasesSnapshot(): ReadonlyArray<SaveCanvasReference>;
  addSavesToCanvas(canvasId: string, ids: ReadonlyArray<string>): void;
  createCanvasWithSaves(ids: ReadonlyArray<string>): void;
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
