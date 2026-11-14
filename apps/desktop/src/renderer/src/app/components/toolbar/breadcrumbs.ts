import { SETTINGS_SECTIONS } from "@pond/schema";
import type { Folder } from "@pond/schema/db";
import type { LibraryNav } from "@/features/library/state/library-chrome";
import { saveIdFromPath } from "@/features/saves/lib/save-nav";
import { getSourceLabel } from "@/features/saves/lib/source-labels";

export interface Breadcrumb {
  label: string;
  path: string;
  nav?: LibraryNav;
}

interface BreadcrumbInput {
  pathname: string;
  listPath: string;
  nav: LibraryNav;
  folders: readonly Pick<Folder, "id" | "name" | "parentId">[];
  saveLabel?: string;
  canvasLabel?: string;
  fishLabel?: string;
  sourceLabel?: string;
  searchResultCount?: number;
}

const SETTINGS_BY_PATH = new Map(
  SETTINGS_SECTIONS.map((section) => [section.path, section]),
);
const SETTINGS_BY_ID = new Map(
  SETTINGS_SECTIONS.map((section) => [section.id, section]),
);

function settingsCrumbs(path: string): Breadcrumb[] {
  const section = SETTINGS_BY_PATH.get(path);
  const crumb = {
    label: section?.label ?? "Settings",
    path: `/settings/${path}`,
  };
  const parent = section?.parent ? SETTINGS_BY_ID.get(section.parent) : null;
  return parent
    ? [{ label: parent.label, path: `/settings/${parent.path}` }, crumb]
    : [crumb];
}

const SPLIT_POSTS_CRUMB: Breadcrumb = {
  label: "Split Posts",
  path: "/split-posts",
  nav: { kind: "splitPosts" },
};

type DestinationLabels = Pick<
  BreadcrumbInput,
  "canvasLabel" | "fishLabel" | "sourceLabel"
>;

function destinationCrumbs(
  base: string,
  { canvasLabel, fishLabel, sourceLabel }: DestinationLabels,
): Breadcrumb[] | null {
  if (base.startsWith("/canvas/"))
    return [{ label: canvasLabel || "Canvas", path: base }];
  if (base.startsWith("/fish/"))
    return [{ label: fishLabel || "Fish", path: base }];
  if (base.startsWith("/sources/"))
    return [
      { label: "Sources", path: "/sources", nav: { kind: "sources" } },
      { label: sourceLabel || "Source", path: base },
    ];
  switch (base) {
    case "/sources":
      return [{ label: "Sources", path: base, nav: { kind: "sources" } }];
    case "/tags":
      return [{ label: "Tags", path: base, nav: { kind: "tags" } }];
    case "/untagged":
      return [{ label: "Untagged", path: base, nav: { kind: "untagged" } }];
    case "/recently-added":
      return [
        {
          label: "Recently Added",
          path: base,
          nav: { kind: "recentlyAdded" },
        },
      ];
    case "/recents":
      return [{ label: "Recently Used", path: base, nav: { kind: "recents" } }];
    case "/downloads":
      return [{ label: "Downloads", path: base, nav: { kind: "downloads" } }];
    case "/trash":
      return [{ label: "Trash", path: base, nav: { kind: "trash" } }];
    case "/split-posts":
      return [SPLIT_POSTS_CRUMB];
    default:
      break;
  }
  if (base.startsWith("/settings")) {
    const crumbs: Breadcrumb[] = [{ label: "Settings", path: "/settings" }];
    const [section] = base.slice("/settings/".length).split("/");
    if (section) crumbs.push(...settingsCrumbs(section));
    return crumbs;
  }
  if (base.startsWith("/source/")) {
    return [
      { label: "Sources", path: "/sources", nav: { kind: "sources" } },
      {
        label: getSourceLabel(base.slice("/source/".length)),
        path: base,
        nav: { kind: "all" },
      },
    ];
  }
  return null;
}

export function buildBreadcrumbs({
  pathname,
  listPath,
  nav,
  folders,
  saveLabel,
  canvasLabel,
  fishLabel,
  sourceLabel,
  searchResultCount,
}: BreadcrumbInput): Breadcrumb[] {
  const isSave = saveIdFromPath(pathname) !== null;
  const base = isSave ? listPath : pathname;
  const destination = destinationCrumbs(base, {
    canvasLabel,
    fishLabel,
    sourceLabel,
  });
  const searchCrumb =
    !isSave && searchResultCount !== undefined
      ? { label: `Search results (${searchResultCount})`, path: base }
      : null;
  if (destination) {
    if (searchCrumb && (base === "/trash" || base.startsWith("/source/")))
      destination.push(searchCrumb);
    if (isSave)
      destination.push({ label: saveLabel || "Save", path: pathname });
    return destination;
  }
  const crumbs: Breadcrumb[] = [
    { label: "All", path: "/", nav: { kind: "all" } },
  ];
  if (base === "/" && nav.kind === "folder") {
    const byId = new Map(folders.map((folder) => [folder.id, folder]));
    const ancestors: Breadcrumb[] = [];
    const seen = new Set<string>();
    let folder = byId.get(nav.id);
    while (folder && !seen.has(folder.id)) {
      seen.add(folder.id);
      ancestors.unshift({
        label: folder.name,
        path: "/",
        nav: { kind: "folder", id: folder.id },
      });
      folder = folder.parentId ? byId.get(folder.parentId) : undefined;
    }
    crumbs.push(
      ...(ancestors.length ? ancestors : [{ label: "Folder", path: "/", nav }]),
    );
  } else if (base === "/" && nav.kind === "uncategorized") {
    crumbs.push({ label: "Uncategorized", path: "/", nav });
  } else if (base === "/" && nav.kind === "tag") {
    crumbs.push({ label: nav.name, path: "/", nav });
  } else if (base === "/" && nav.kind === "random") {
    crumbs[0] = { label: "Random", path: "/", nav };
  } else if (base === "/" && nav.kind === "post") {
    crumbs[0] = SPLIT_POSTS_CRUMB;
    crumbs.push({ label: nav.title || "Post", path: "/", nav });
  }
  if (searchCrumb) crumbs.push(searchCrumb);
  if (isSave) crumbs.push({ label: saveLabel || "Save", path: pathname });
  return crumbs;
}
