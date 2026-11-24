import { IconLayers, IconNodes3, IconTrashXmark } from "@pond/icons";
import { describe, expect, it } from "vitest";
import type { LibraryNav } from "@/shared/lib/library-nav";
import type { RouteMeta } from "@/shared/lib/route-meta";
import { buildBreadcrumbs } from "./breadcrumbs";

const folders = [
  { id: "parent", name: "Design", parentId: null },
  { id: "child", name: "Interfaces", parentId: "parent" },
];

type Meta = Parameters<typeof buildBreadcrumbs>[0]["meta"];

function grid(nav: LibraryNav, crumb: RouteMeta["crumb"] = null): Meta {
  return {
    routeId: "/_library/_grid/x",
    nav,
    crumb,
    params: {},
    surface: "grid",
  };
}

function page(routeId: string, params: Record<string, string> = {}): Meta {
  return { routeId, nav: null, crumb: null, params, surface: "page" };
}

const labels = (meta: Meta, pathname = "/", extra = {}) =>
  buildBreadcrumbs({ meta, pathname, folders, ...extra }).map((c) => c.label);

describe("library breadcrumbs", () => {
  it("keeps the library root to one crumb", () => {
    expect(
      buildBreadcrumbs({ meta: grid({ kind: "all" }), pathname: "/", folders }),
    ).toMatchObject([{ label: "All", path: "/", nav: { kind: "all" } }]);
  });

  it.each([
    [{ kind: "trash" }, { label: "Trash", icon: IconTrashXmark }, "Trash"],
    [{ kind: "sources" }, { label: "Sources", icon: IconNodes3 }, "Sources"],
    [
      { kind: "splitPosts" },
      { label: "Split Posts", icon: IconLayers },
      "Split Posts",
    ],
  ] as const)("uses the route crumb for %o", (nav, crumb, label) => {
    expect(labels(grid(nav, crumb))).toEqual([label]);
  });

  it("names a page by its route crumb", () => {
    expect(
      labels({
        ...page("/_library/canvases"),
        crumb: { label: "Canvases", icon: IconLayers },
      }),
    ).toEqual(["Canvases"]);
  });

  it("places a split post under Split Posts", () => {
    const nav = { kind: "post", key: "instagram:DAbC" } as const;
    expect(
      buildBreadcrumbs({
        meta: grid(nav),
        pathname: "/split-posts/instagram%3ADAbC",
        folders,
        labels: { post: "Studio" },
      }),
    ).toMatchObject([
      {
        label: "Split Posts",
        path: "/split-posts",
        nav: { kind: "splitPosts" },
      },
      { label: "Studio", path: "/split-posts/instagram%3ADAbC", nav },
    ]);
  });

  it("names a fish page after its fish", () => {
    expect(
      buildBreadcrumbs({
        meta: page("/_library/fish/$fishId"),
        pathname: "/fish/koi",
        folders,
        labels: { fish: "Koi" },
      }),
    ).toEqual([{ label: "Koi", path: "/fish/koi" }]);
  });

  it("orders folder parents before children and gives each a destination", () => {
    const crumbs = buildBreadcrumbs({
      meta: grid({ kind: "folder", id: "child" }),
      pathname: "/folders/child",
      folders,
    });
    expect(crumbs.map((c) => c.label)).toEqual(["All", "Design", "Interfaces"]);
    expect(crumbs[1]).toMatchObject({
      path: "/folders/parent",
      nav: { kind: "folder", id: "parent" },
    });
    expect(crumbs[2]?.nav).toEqual({ kind: "folder", id: "child" });
  });

  it.each([
    ["mcp", ["Settings", "Model Context Protocol"]],
    ["agent-models", ["Settings", "Models"]],
    ["models", ["Settings", "Providers"]],
    ["library", ["Settings", "Library"]],
    ["storage", ["Settings", "Storage"]],
    ["backups", ["Settings", "Backups"]],
    ["processing", ["Settings", "Processing"]],
    ["schedule", ["Settings", "Schedule"]],
    ["sources", ["Settings", "Sources"]],
    ["images", ["Settings", "Images"]],
    ["videos", ["Settings", "Videos"]],
  ] as const)("labels the settings section %s", (section, expected) => {
    expect(
      labels(
        page("/_library/settings/$section", { section }),
        `/settings/${section}`,
      ),
    ).toEqual(expected);
  });

  it("keeps Settings as its own root", () => {
    expect(labels(page("/_library/settings/"), "/settings")).toEqual([
      "Settings",
    ]);
  });

  it("nests a source download page under Sources", () => {
    expect(
      buildBreadcrumbs({
        meta: page("/_library/settings/$section", {
          section: "sources-youtube",
        }),
        pathname: "/settings/sources-youtube",
        folders,
      }).map(({ label, path }) => ({ label, path })),
    ).toEqual([
      { label: "Settings", path: "/settings" },
      { label: "Sources", path: "/settings/sources" },
      { label: "YouTube", path: "/settings/sources-youtube" },
    ]);
  });

  it("nests a source detail page under Sources", () => {
    expect(
      buildBreadcrumbs({
        meta: page("/_library/sources_/$kind/$id"),
        pathname: "/sources/account/acc-1",
        folders,
        labels: { source: "@raphaelsalaja" },
      }).map(({ label, path }) => ({ label, path })),
    ).toEqual([
      { label: "Sources", path: "/sources" },
      { label: "@raphaelsalaja", path: "/sources/account/acc-1" },
    ]);
  });

  it("adds an open save after its containing folder path", () => {
    expect(
      labels(grid({ kind: "folder", id: "child" }), "/folders/child", {
        saveOpen: true,
        labels: { save: "A saved interface" },
      }),
    ).toEqual(["All", "Design", "Interfaces", "A saved interface"]);
  });

  it("keeps the canvas as the parent of a save opened from it", () => {
    expect(
      buildBreadcrumbs({
        meta: page("/_library/canvas/$id"),
        pathname: "/canvas/board",
        folders,
        saveOpen: true,
        labels: { canvas: "App idea", save: "Type specimen" },
      }).map((c) => c.label),
    ).toEqual(["App idea", "Type specimen"]);
  });

  it("adds a search crumb on the grid until a save opens", () => {
    const meta = grid(
      { kind: "trash" },
      { label: "Trash", icon: IconTrashXmark },
    );
    expect(labels(meta, "/trash", { searchResultCount: 3 })).toEqual([
      "Trash",
      "Search results (3)",
    ]);
    expect(
      labels(meta, "/trash", { searchResultCount: 3, saveOpen: true }),
    ).toEqual(["Trash", "Save"]);
  });

  it("supports Uncategorized and tag locations", () => {
    expect(labels(grid({ kind: "uncategorized" }))).toEqual([
      "All",
      "Uncategorized",
    ]);
    expect(labels(grid({ kind: "tag", name: "Animation" }))).toEqual([
      "All",
      "Animation",
    ]);
  });

  it("handles missing folders and cyclic ancestry without hanging", () => {
    expect(labels(grid({ kind: "folder", id: "missing" }))).toEqual([
      "All",
      "Folder",
    ]);
    const cyclic = folders.map((f) => ({
      ...f,
      parentId: f.id === "parent" ? "child" : "parent",
    }));
    expect(
      buildBreadcrumbs({
        meta: grid({ kind: "folder", id: "child" }),
        pathname: "/folders/child",
        folders: cyclic,
      }).map((c) => c.label),
    ).toEqual(["All", "Design", "Interfaces"]);
  });
});
