import type { Folder } from "@pond/schema/db";
import type { LibraryNav } from "@/shared/lib/library-nav";

export type SearchScope = "all" | "current";

export type SearchView =
  | { kind: "library" }
  | { kind: "folder"; id: string }
  | { kind: "tag"; name: string }
  | { kind: "uncategorized" }
  | { kind: "untagged" }
  | { kind: "recentlyAdded" }
  | { kind: "recents" }
  | { kind: "trash" };

export function searchViewFor(nav: LibraryNav | null): SearchView {
  switch (nav?.kind) {
    case "trash":
    case "recents":
    case "recentlyAdded":
    case "untagged":
      return { kind: nav.kind };
    case "folder":
      return { kind: "folder", id: nav.id };
    case "tag":
      return { kind: "tag", name: nav.name };
    case "uncategorized":
      return { kind: "uncategorized" };
    default:
      return { kind: "library" };
  }
}

export function searchViewKey(view: SearchView): string {
  switch (view.kind) {
    case "folder":
      return `folder:${view.id}`;
    case "tag":
      return `tag:${view.name}`;
    default:
      return view.kind;
  }
}

/** Built-in views are slices of the Library you jump between, so only folders and tags you made offer a wider search. */
export function canSearchAllSaves(view: SearchView): boolean {
  return view.kind === "folder" || view.kind === "tag";
}

export function searchViewName(
  view: SearchView,
  folders: readonly Pick<Folder, "id" | "name">[],
): string {
  switch (view.kind) {
    case "library":
      return "Library";
    case "folder":
      return folders.find((folder) => folder.id === view.id)?.name ?? "Folder";
    case "tag":
      return view.name;
    case "uncategorized":
      return "Uncategorized";
    case "untagged":
      return "Untagged";
    case "recentlyAdded":
      return "Recently Added";
    case "recents":
      return "Recently Used";
    case "trash":
      return "Trash";
  }
}
