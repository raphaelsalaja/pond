export type LibraryNav =
  | { kind: "all" }
  | { kind: "recentlyAdded" }
  | { kind: "recents" }
  | { kind: "random" }
  | { kind: "uncategorized" }
  | { kind: "folder"; id: string }
  | { kind: "tag"; name: string }
  | { kind: "trash" }
  | { kind: "downloads" }
  | { kind: "sources" }
  | { kind: "tags" }
  | { kind: "untagged" };

const ALL: LibraryNav = { kind: "all" };
const RECENTLY_ADDED: LibraryNav = { kind: "recentlyAdded" };
const RECENTS: LibraryNav = { kind: "recents" };
const TRASH: LibraryNav = { kind: "trash" };
const DOWNLOADS: LibraryNav = { kind: "downloads" };
const SOURCES: LibraryNav = { kind: "sources" };
const TAGS: LibraryNav = { kind: "tags" };
const UNTAGGED: LibraryNav = { kind: "untagged" };

const COLLECTION_PATHS = new Set([
  "/",
  "/trash",
  "/downloads",
  "/sources",
  "/recents",
  "/recently-added",
  "/tags",
  "/untagged",
]);

export function pathForLibraryNav(nav: LibraryNav): string {
  switch (nav.kind) {
    case "trash":
      return "/trash";
    case "downloads":
      return "/downloads";
    case "sources":
      return "/sources";
    case "recents":
      return "/recents";
    case "recentlyAdded":
      return "/recently-added";
    case "tags":
      return "/tags";
    case "untagged":
      return "/untagged";
    case "all":
    case "random":
    case "uncategorized":
    case "folder":
    case "tag":
      return "/";
  }
}

export function isLibraryCollectionPath(pathname: string): boolean {
  return COLLECTION_PATHS.has(pathname);
}

/**
 * The collection the sidebar should show as current.
 * A route that is itself a collection is the page on screen, so it wins over
 * `nav`. `/` has no collection of its own and uses `nav` for a folder, tag, or
 * All; a routed `nav` left behind on `/` is not that page. Fish and Canvas are
 * not library rows.
 */
export function activeLibraryDestination(
  pathname: string,
  nav: LibraryNav,
): LibraryNav | null {
  if (pathname.startsWith("/fish/") || pathname.startsWith("/canvas/"))
    return null;
  switch (pathname) {
    case "/downloads":
      return DOWNLOADS;
    case "/sources":
      return SOURCES;
    case "/tags":
      return TAGS;
    case "/untagged":
      return UNTAGGED;
    case "/trash":
      return TRASH;
    case "/recents":
      return RECENTS;
    case "/recently-added":
      return RECENTLY_ADDED;
    default:
      break;
  }
  switch (nav.kind) {
    case "all":
    case "folder":
    case "uncategorized":
    case "tag":
    case "random":
      return nav;
    default:
      return pathname === "/" || pathname === "" ? ALL : nav;
  }
}
