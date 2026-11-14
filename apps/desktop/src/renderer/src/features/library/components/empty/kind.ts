import type { LibraryNav } from "@/features/library/state/library-chrome";
import type { SaveListMode } from "@/features/saves";

export type LibraryEmptyKind =
  | "trash"
  | "folder"
  | "inbox"
  | "library"
  | "matches"
  | "section"
  | "uncategorized";

export function libraryEmptyKind(input: {
  mode: SaveListMode;
  navKind: LibraryNav["kind"];
  hasActiveSearch: boolean;
  hasActiveFilter: boolean;
  libraryTotal: number;
}): LibraryEmptyKind {
  const filtering = input.hasActiveSearch || input.hasActiveFilter;
  if (input.mode === "trash" && !filtering) return "trash";
  if (input.navKind === "folder" && !filtering) return "folder";
  if (input.libraryTotal === 0 && input.mode !== "trash") return "library";
  if (input.navKind === "inbox" && !filtering) return "inbox";
  if (filtering) return "matches";
  if (input.mode !== "library" && input.mode !== "trash") return "section";
  if (input.navKind === "uncategorized") return "uncategorized";
  return "matches";
}
