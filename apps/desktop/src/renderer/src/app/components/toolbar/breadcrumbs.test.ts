import { describe, expect, it } from "vitest";
import { buildBreadcrumbs } from "./breadcrumbs";

const folders = [
  { id: "parent", name: "Design", parentId: null },
  { id: "child", name: "Interfaces", parentId: "parent" },
];

describe("library breadcrumb paths", () => {
  it("keeps the library root to one crumb", () => {
    expect(
      buildBreadcrumbs({
        pathname: "/",
        listPath: "/",
        nav: { kind: "all" },
        folders,
      }),
    ).toEqual([{ label: "All", path: "/", nav: { kind: "all" } }]);
  });

  it.each([
    ["/fish/default", "Fish"],
    ["/sources", "Sources"],
    ["/tags", "Tags"],
    ["/untagged", "Untagged"],
    ["/downloads", "Downloads"],
    ["/trash", "Trash"],
    ["/split-posts", "Split Posts"],
    ["/settings", "Settings"],
  ] as const)("keeps %s as its own root", (pathname, label) => {
    expect(
      buildBreadcrumbs({
        pathname,
        listPath: "/",
        nav: { kind: "folder", id: "child" },
        folders,
      }).map((crumb) => crumb.label),
    ).toEqual([label]);
  });

  it("places a split post under Split Posts", () => {
    const nav = {
      kind: "post",
      key: "instagram:DAbC",
      title: "Studio",
    } as const;
    expect(
      buildBreadcrumbs({ pathname: "/", listPath: "/", nav, folders }),
    ).toEqual([
      {
        label: "Split Posts",
        path: "/split-posts",
        nav: { kind: "splitPosts" },
      },
      { label: "Studio", path: "/", nav },
    ]);
  });

  it("names a fish page after its fish", () => {
    expect(
      buildBreadcrumbs({
        pathname: "/fish/koi",
        listPath: "/",
        nav: { kind: "all" },
        folders,
        fishLabel: "Koi",
      }),
    ).toEqual([{ label: "Koi", path: "/fish/koi" }]);
  });

  it("orders folder parents before children and gives each a destination", () => {
    const crumbs = buildBreadcrumbs({
      pathname: "/",
      listPath: "/",
      nav: { kind: "folder", id: "child" },
      folders,
    });
    expect(crumbs.map((c) => c.label)).toEqual(["All", "Design", "Interfaces"]);
    expect(crumbs[1]?.nav).toEqual({ kind: "folder", id: "parent" });
    expect(crumbs[2]?.nav).toEqual({ kind: "folder", id: "child" });
  });

  it("nests Model Context Protocol under Settings", () => {
    expect(
      buildBreadcrumbs({
        pathname: "/settings/mcp",
        listPath: "/",
        nav: { kind: "folder", id: "child" },
        folders,
      }).map((c) => c.label),
    ).toEqual(["Settings", "Model Context Protocol"]);
  });

  it("nests Models under Settings", () => {
    expect(
      buildBreadcrumbs({
        pathname: "/settings/agent-models",
        listPath: "/",
        nav: { kind: "folder", id: "child" },
        folders,
      }).map((c) => c.label),
    ).toEqual(["Settings", "Models"]);
  });

  it("nests a settings section under Settings", () => {
    expect(
      buildBreadcrumbs({
        pathname: "/settings/models",
        listPath: "/",
        nav: { kind: "folder", id: "child" },
        folders,
      }).map((c) => c.label),
    ).toEqual(["Settings", "Providers"]);
  });

  it.each([
    ["/settings/library", "Library"],
    ["/settings/storage", "Storage"],
    ["/settings/backups", "Backups"],
    ["/settings/processing", "Processing"],
    ["/settings/schedule", "Schedule"],
    ["/settings/sources", "Sources"],
    ["/settings/images", "Images"],
    ["/settings/videos", "Videos"],
  ] as const)("labels the focused section at %s", (pathname, label) => {
    expect(
      buildBreadcrumbs({
        pathname,
        listPath: "/",
        nav: { kind: "all" },
        folders,
      }).map((crumb) => crumb.label),
    ).toEqual(["Settings", label]);
  });

  it("nests a source download page under Sources", () => {
    expect(
      buildBreadcrumbs({
        pathname: "/settings/sources-youtube",
        listPath: "/",
        nav: { kind: "all" },
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
        pathname: "/sources/account/acc-1",
        listPath: "/",
        nav: { kind: "all" },
        folders,
        sourceLabel: "@raphaelsalaja",
      }).map(({ label, path }) => ({ label, path })),
    ).toEqual([
      { label: "Sources", path: "/sources" },
      { label: "@raphaelsalaja", path: "/sources/account/acc-1" },
    ]);
  });

  it("nests a source page under Sources", () => {
    expect(
      buildBreadcrumbs({
        pathname: "/source/pinterest",
        listPath: "/",
        nav: { kind: "folder", id: "child" },
        folders,
      }).map((c) => c.label),
    ).toEqual(["Sources", "Pinterest"]);
  });

  it("includes a save after its containing folder path", () => {
    const crumbs = buildBreadcrumbs({
      pathname: "/save/one",
      listPath: "/",
      nav: { kind: "folder", id: "child" },
      folders,
      saveLabel: "A saved interface",
    });
    expect(crumbs.map((c) => c.label)).toEqual([
      "All",
      "Design",
      "Interfaces",
      "A saved interface",
    ]);
  });

  it("names the open canvas and keeps it as the parent of a save opened from it", () => {
    expect(
      buildBreadcrumbs({
        pathname: "/canvas/board",
        listPath: "/",
        nav: { kind: "folder", id: "child" },
        folders,
        canvasLabel: "App idea",
      }),
    ).toEqual([{ label: "App idea", path: "/canvas/board" }]);
    expect(
      buildBreadcrumbs({
        pathname: "/save/one",
        listPath: "/canvas/board",
        nav: { kind: "all" },
        folders,
        canvasLabel: "App idea",
        saveLabel: "Type specimen",
      }).map((c) => c.path),
    ).toEqual(["/canvas/board", "/save/one"]);
  });

  it("uses the originating list for saves opened from Trash", () => {
    expect(
      buildBreadcrumbs({
        pathname: "/save/one",
        listPath: "/trash",
        nav: { kind: "all" },
        folders,
      }).map((c) => c.label),
    ).toEqual(["Trash", "Save"]);
  });

  it("supports Uncategorized and tag locations", () => {
    expect(
      buildBreadcrumbs({
        pathname: "/",
        listPath: "/",
        nav: { kind: "uncategorized" },
        folders,
      }).map((c) => c.label),
    ).toEqual(["All", "Uncategorized"]);
    expect(
      buildBreadcrumbs({
        pathname: "/",
        listPath: "/",
        nav: { kind: "tag", name: "Animation" },
        folders,
      }).map((c) => c.label),
    ).toEqual(["All", "Animation"]);
  });

  it("handles missing folders and cyclic ancestry without hanging", () => {
    expect(
      buildBreadcrumbs({
        pathname: "/",
        listPath: "/",
        nav: { kind: "folder", id: "missing" },
        folders,
      }).map((c) => c.label),
    ).toEqual(["All", "Folder"]);
    const cyclic = folders.map((f) => ({
      ...f,
      parentId: f.id === "parent" ? "child" : "parent",
    }));
    expect(
      buildBreadcrumbs({
        pathname: "/",
        listPath: "/",
        nav: { kind: "folder", id: "child" },
        folders: cyclic,
      }).map((c) => c.label),
    ).toEqual(["All", "Design", "Interfaces"]);
  });
});
