import {
  IconAlbum2,
  IconCanvas,
  IconLayers,
  IconNodes3,
  IconNut,
} from "@pond/icons";
import type { IconComponent } from "@pond/icons/types";
import { SETTINGS_SECTIONS } from "@pond/schema";
import type { Folder } from "@pond/schema/db";
import {
  type LibraryNav,
  pathForLibraryNav,
} from "@/shared/lib/library-nav";
import type { RouteMeta } from "@/shared/lib/route-meta";

export interface Breadcrumb {
  label: string;
  path: string;
  icon?: IconComponent;
  nav?: LibraryNav;
}

export interface BreadcrumbLabels {
  save?: string;
  canvas?: string;
  fish?: string;
  source?: string;
  post?: string;
}

interface BreadcrumbInput {
  meta: Pick<RouteMeta, "routeId" | "nav" | "crumb" | "params" | "surface">;
  pathname: string;
  folders: readonly Pick<Folder, "id" | "name" | "parentId">[];
  /** Set while a Save is open over the route. */
  saveOpen?: boolean;
  labels?: BreadcrumbLabels;
  searchResultCount?: number;
}

const SETTINGS_BY_PATH = new Map(
  SETTINGS_SECTIONS.map((section) => [section.path, section]),
);
const SETTINGS_BY_ID = new Map(
  SETTINGS_SECTIONS.map((section) => [section.id, section]),
);

function settingsCrumbs(section: string | undefined): Breadcrumb[] {
  const crumbs: Breadcrumb[] = [
    { label: "Settings", path: "/settings", icon: IconNut },
  ];
  if (!section) return crumbs;
  const entry = SETTINGS_BY_PATH.get(section);
  const parent = entry?.parent ? SETTINGS_BY_ID.get(entry.parent) : null;
  if (parent)
    crumbs.push({ label: parent.label, path: `/settings/${parent.path}` });
  crumbs.push({
    label: entry?.label ?? "Settings",
    path: `/settings/${section}`,
  });
  return crumbs;
}

function crumbFor(nav: LibraryNav, label: string): Breadcrumb {
  return { label, path: pathForLibraryNav(nav), nav };
}

const ALL: Breadcrumb = { ...crumbFor({ kind: "all" }, "All"), icon: IconAlbum2 };
const SOURCES: Breadcrumb = {
  ...crumbFor({ kind: "sources" }, "Sources"),
  icon: IconNodes3,
};
const SPLIT_POSTS: Breadcrumb = {
  ...crumbFor({ kind: "splitPosts" }, "Split Posts"),
  icon: IconLayers,
};

function folderCrumbs(
  id: string,
  folders: BreadcrumbInput["folders"],
): Breadcrumb[] {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const ancestors: Breadcrumb[] = [];
  const seen = new Set<string>();
  let folder = byId.get(id);
  while (folder && !seen.has(folder.id)) {
    seen.add(folder.id);
    ancestors.unshift(crumbFor({ kind: "folder", id: folder.id }, folder.name));
    folder = folder.parentId ? byId.get(folder.parentId) : undefined;
  }
  return ancestors.length
    ? ancestors
    : [crumbFor({ kind: "folder", id }, "Folder")];
}

function navCrumbs(
  nav: LibraryNav,
  meta: BreadcrumbInput["meta"],
  input: BreadcrumbInput,
): Breadcrumb[] {
  const labels = input.labels ?? {};
  switch (nav.kind) {
    case "folder":
      return [ALL, ...folderCrumbs(nav.id, input.folders)];
    case "inbox": {
      const inbox = { ...crumbFor({ kind: "inbox" }, "Inbox"), icon: IconAlbum2 };
      return nav.snoozed ? [inbox, crumbFor(nav, "Snoozed")] : [inbox];
    }
    case "uncategorized":
      return [ALL, crumbFor(nav, "Uncategorized")];
    case "tag":
      return [ALL, crumbFor(nav, nav.name)];
    case "post":
      return [SPLIT_POSTS, crumbFor(nav, labels.post || "Post")];
    default:
      return meta.crumb
        ? [{ ...crumbFor(nav, meta.crumb.label), icon: meta.crumb.icon }]
        : [ALL];
  }
}

function routeCrumbs(input: BreadcrumbInput): Breadcrumb[] {
  const { meta, pathname, labels = {} } = input;
  const routeId = meta.routeId ?? "";
  if (routeId.startsWith("/_library/settings"))
    return settingsCrumbs(meta.params.section);
  if (routeId === "/_library/canvas/$id")
    return [{ label: labels.canvas || "Canvas", path: pathname, icon: IconCanvas }];
  if (routeId === "/_library/fish/$fishId")
    return [{ label: labels.fish || "Fish", path: pathname }];
  if (routeId === "/_library/sources_/$kind/$id")
    return [SOURCES, { label: labels.source || "Source", path: pathname }];
  if (meta.nav) return navCrumbs(meta.nav, meta, input);
  if (meta.crumb)
    return [{ label: meta.crumb.label, path: pathname, icon: meta.crumb.icon }];
  return [ALL];
}

export function buildBreadcrumbs(input: BreadcrumbInput): Breadcrumb[] {
  const crumbs = routeCrumbs(input);
  if (
    !input.saveOpen &&
    input.meta.surface === "grid" &&
    input.searchResultCount !== undefined
  )
    crumbs.push({
      label: `Search results (${input.searchResultCount})`,
      path: input.pathname,
    });
  if (input.saveOpen)
    crumbs.push({ label: input.labels?.save || "Save", path: input.pathname });
  return crumbs;
}
