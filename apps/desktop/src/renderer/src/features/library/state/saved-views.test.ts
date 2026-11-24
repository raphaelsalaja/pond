import type { SavedView } from "@pond/schema/db";
import { matches } from "@pond/schema/filters/match";
import { EMPTY_QUERY, type Query } from "@pond/schema/filters/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pathForLibraryNav } from "@/shared/lib/library-nav";
import {
  currentLocation,
  type LibraryTestRouter,
  openLibraryAt,
} from "@/shared/test/library-router";
import { combineQueries } from "../lib/smart-folders";
import { savedViews } from "./saved-views";
import {
  getViewState,
  resetFilters,
  setLayout,
  setQuery,
  setSort,
} from "./view-store";
import { startViewUrlSync } from "./view-url";

function view(
  id: string,
  parentId: string | null,
  kind: SavedView["kind"] = "group",
  query: Query = EMPTY_QUERY,
): SavedView {
  return {
    id,
    parentId,
    kind,
    name: id,
    query,
    question: null,
    sortKey: "savedAt",
    sortDir: "desc",
    layout: null,
    sortOrder: 0,
    createdAt: new Date(0),
  };
}

const branding: Query = {
  combinator: "and",
  rules: [{ field: "tags", operator: "some", value: ["branding"] }],
};
const design: Query = {
  combinator: "and",
  rules: [{ field: "tags", operator: "some", value: ["design"] }],
};

interface ViewCommand extends Partial<SavedView> {
  patch?: Partial<SavedView>;
}

describe("saved smart folder operations", () => {
  let records: SavedView[];
  let failMutation: boolean;
  let router: LibraryTestRouter;
  let stopUrlSync: () => void;
  const query = vi.fn(async (name: string, input: ViewCommand) => {
    if (name === "savedViews.list") return records;
    if (failMutation) return { ok: false };
    if (name === "savedViews.create") {
      const created = { ...view("new", null, "saved_view"), ...input };
      records = [...records, created];
      return { ok: true, id: created.id };
    }
    if (name === "savedViews.update") {
      records = records.map((entry) =>
        entry.id === input.id ? { ...entry, ...input.patch } : entry,
      );
    }
    if (name === "savedViews.delete") {
      records = records.filter((entry) => entry.id !== input.id);
    }
    return { ok: true };
  });

  beforeEach(async () => {
    resetFilters();
    router = await openLibraryAt("/");
    stopUrlSync = startViewUrlSync(router);
    records = [
      view("parent", null, "group", branding),
      view("child", "parent", "smart_folder"),
      view("other", null, "group", design),
    ];
    failMutation = false;
    query.mockClear();
    vi.stubGlobal("pond", { query });
    await savedViews.refresh();
  });

  afterEach(() => {
    stopUrlSync();
    vi.unstubAllGlobals();
  });

  it("opens the selected item at its own path", () => {
    savedViews.select("child");
    expect(currentLocation(router).pathname).toBe("/views/child");
    expect(getViewState()).toMatchObject({
      activeViewId: "child",
      inheritedQuery: branding,
    });
  });

  it("refreshes inherited group filters while retaining unsaved child edits", async () => {
    savedViews.select("child");
    const local: Query = {
      combinator: "and",
      rules: [{ field: "source", operator: "eq", value: "instagram.com" }],
    };
    setQuery(local);
    records = records.map((entry) =>
      entry.id === "parent" ? { ...entry, query: design } : entry,
    );
    await savedViews.refresh();
    expect(getViewState().query).toEqual(local);
    expect(getViewState().inheritedQuery).toEqual(design);
    const effective = combineQueries([
      getViewState().query,
      getViewState().inheritedQuery,
    ]);
    const save = {
      id: "save",
      source: "instagram",
      url: "https://instagram.com/p/1",
      tags: ["design"],
    };
    expect(matches(effective, save)).toBe(true);
    expect(matches(effective, { ...save, tags: ["branding"] })).toBe(false);
  });

  it("recomposes inheritance when an active item moves", async () => {
    savedViews.select("child");
    setQuery(branding);
    await savedViews.move("child", "other");
    expect(getViewState()).toMatchObject({
      activeViewId: "child",
      query: branding,
      inheritedQuery: design,
    });
  });

  it("resets the active selection after deletion", async () => {
    savedViews.select("child");
    await savedViews.remove("child");
    expect(currentLocation(router).pathname).toBe("/");
    expect(getViewState()).toMatchObject({
      activeViewId: null,
      query: EMPTY_QUERY,
      inheritedQuery: EMPTY_QUERY,
    });
  });

  it("starts a child of the selected group with its own empty conditions", async () => {
    savedViews.select("parent");
    const created = await savedViews.create({
      name: "Child",
      kind: "smart_folder",
      parentId: "parent",
    });
    expect(created).toMatchObject({
      kind: "smart_folder",
      parentId: "parent",
      query: EMPTY_QUERY,
    });
    expect(getViewState()).toMatchObject({
      activeViewId: created.id,
      query: EMPTY_QUERY,
      inheritedQuery: branding,
    });
  });

  it("starts sibling conditions empty without copying the active child's group filters", async () => {
    savedViews.select("child");
    setQuery(design);
    const created = await savedViews.create({
      name: "Sibling",
      kind: "smart_folder",
      parentId: "parent",
    });
    expect(created.query).toEqual(EMPTY_QUERY);
    expect(getViewState().inheritedQuery).toEqual(branding);
    expect(getViewState().query).toEqual(EMPTY_QUERY);
  });

  it("captures folder scope and saved view presentation", async () => {
    router.history.push(pathForLibraryNav({ kind: "folder", id: "folder" }));
    await router.load();
    setQuery(branding);
    setLayout("grid");
    setSort({ key: "title", dir: "asc" });
    const created = await savedViews.create({
      name: "View",
      kind: "saved_view",
    });
    expect(created).toMatchObject({
      layout: "grid",
      sortKey: "title",
      sortDir: "asc",
    });
    expect(
      matches(created.query, {
        id: "save",
        source: "local",
        url: "",
        tags: ["branding"],
        folderIds: ["folder"],
      }),
    ).toBe(true);
    expect(
      matches(created.query, {
        id: "save",
        source: "local",
        url: "",
        tags: ["branding"],
        folderIds: ["other"],
      }),
    ).toBe(false);
  });

  it("saves local conditions without copying inherited rules or presentation to a smart folder", async () => {
    savedViews.select("child");
    setQuery(design);
    setLayout("list");
    setSort({ key: "title", dir: "asc" });
    await savedViews.updateCurrent("child");
    expect(query).toHaveBeenCalledWith("savedViews.update", {
      id: "child",
      patch: { query: design },
    });
    expect(getViewState().inheritedQuery).toEqual(branding);
    await expect(savedViews.updateCurrent("other")).rejects.toThrow(
      "Open this smart folder item",
    );
  });

  it("propagates a failed mutation without changing the active selection", async () => {
    savedViews.select("child");
    failMutation = true;
    await expect(savedViews.remove("child")).rejects.toThrow(
      "Could not delete",
    );
    expect(getViewState().activeViewId).toBe("child");
    await expect(
      savedViews.create({ kind: "saved_view", name: "Failed" }),
    ).rejects.toThrow("Could not create");
    expect(savedViews.snapshot()).toHaveLength(3);
  });
});
