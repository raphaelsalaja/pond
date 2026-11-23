import type { Predicate } from "@pond/schema/filters/types";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";

export function showInLibrary(ids: readonly string[]): void {
  saveLibraryBridge.showSaves(ids);
}

export function showMatchingInLibrary(predicate: Predicate): void {
  saveLibraryBridge.showLibrary({ kind: "all" }, predicate);
}

export function showFolderInLibrary(id: string): void {
  saveLibraryBridge.showLibrary({ kind: "folder", id });
}

export function reviewDuplicates(ids: readonly string[]): void {
  saveLibraryBridge.openDuplicateReview({ ids });
}
