import { matches } from "@pond/schema/filters/match";
import { EMPTY_QUERY, type Query } from "@pond/schema/filters/types";
import { beforeEach, describe, expect, it } from "vitest";
import { type SearchView, searchViewKey } from "../lib/search-view";
import { combineQueries } from "../lib/smart-folders";
import {
  activateFolderPresentation,
  applySavedView,
  getViewState,
  resetFilters,
  searchAllSaves,
  searchCurrentView,
  setCombinator,
  setLayout,
  setQuery,
  setSearchDraft,
  setSemanticQuery,
  setSort,
  setVisualProbe,
  updateLocalFilters,
  updateRow,
} from "./view-store";

const designFolder: SearchView = { kind: "folder", id: "design" };

describe("library search scope", () => {
  beforeEach(() => {
    resetFilters();
  });

  it("searches the current view by default", () => {
    setSearchDraft("reference");
    expect(getViewState().searchAllView).toBeNull();
  });

  it("returns to the current view when filters reset for a new view", () => {
    searchAllSaves(designFolder);
    resetFilters();
    expect(getViewState().searchAllView).toBeNull();
  });

  it.each([{ kind: "trash" }, { kind: "library" }] as const)(
    "keeps $kind on its own Saves",
    (view) => {
      searchAllSaves(view);
      expect(getViewState().searchAllView).toBeNull();
    },
  );
});

const parentQuery: Query = {
  combinator: "or",
  rules: [
    { field: "tags", operator: "some", value: ["branding"] },
    { field: "tags", operator: "some", value: ["design"] },
  ],
};
const childQuery: Query = {
  combinator: "and",
  rules: [{ field: "source", operator: "eq", value: "instagram.com" }],
};

function effectiveQuery(): Query {
  const { query, inheritedQuery } = getViewState();
  return combineQueries([inheritedQuery, query]);
}

describe("smart folder selection", () => {
  beforeEach(() => {
    resetFilters();
    setSort({ key: "title", dir: "asc" });
    setLayout("list");
  });

  it("tracks search scope independently from the query", () => {
    setSearchDraft("reference");
    searchAllSaves(designFolder);
    expect(getViewState()).toMatchObject({
      q: "reference",
      searchAllView: searchViewKey(designFolder),
    });
    searchCurrentView();
    expect(getViewState()).toMatchObject({
      q: "reference",
      searchAllView: null,
    });
  });

  it("ANDs parent alternatives with editable child conditions", () => {
    applySavedView({
      id: "child",
      kind: "smart_folder",
      query: childQuery,
      inheritedQuery: parentQuery,
    });
    const save = {
      id: "save",
      source: "instagram",
      url: "https://instagram.com/p/1",
      tags: ["design"],
    };
    expect(matches(effectiveQuery(), save)).toBe(true);
    expect(matches(effectiveQuery(), { ...save, tags: ["other"] })).toBe(false);
    expect(
      matches(effectiveQuery(), {
        ...save,
        source: "twitter",
        url: "https://x.com/a/status/1",
      }),
    ).toBe(false);
    updateRow(0, { field: "source", operator: "eq", value: "x.com" });
    expect(getViewState().inheritedQuery).toEqual(parentQuery);
    expect(matches(effectiveQuery(), save)).toBe(false);
    expect(
      matches(effectiveQuery(), {
        ...save,
        source: "twitter",
        url: "https://x.com/a/status/1",
      }),
    ).toBe(true);
  });

  it("restores a saved view's descending sort and layout", () => {
    applySavedView({
      id: "view",
      kind: "saved_view",
      query: EMPTY_QUERY,
      sortKey: "savedAt",
      sortDir: "desc",
      layout: "grid",
    });
    expect(getViewState()).toMatchObject({
      sortKey: "savedAt",
      sortDir: "desc",
      layout: "grid",
    });
  });

  it.each(["smart_folder", "group"] as const)(
    "preserves presentation for %s",
    (kind) => {
      applySavedView({
        id: "view",
        kind,
        query: EMPTY_QUERY,
        sortKey: "savedAt",
        sortDir: "desc",
        layout: "grid",
      });
      expect(getViewState()).toMatchObject({
        sortKey: "title",
        sortDir: "asc",
        layout: "list",
      });
    },
  );

  it("clears previous text, semantic, and visual searches", () => {
    setSearchDraft("sunsets source:instagram.com");
    setSemanticQuery("sunsets");
    setVisualProbe({ kind: "saveId", id: "old", label: "Old image" });
    applySavedView({ id: "view", query: childQuery });
    expect(getViewState()).toMatchObject({
      q: "",
      searchInput: "",
      semanticQuery: null,
      visualProbe: null,
      query: childQuery,
    });
  });

  it("preserves nested clauses and negation through loading and editing", () => {
    const nestedQuery: Query = {
      combinator: "and",
      not: true,
      rules: [...childQuery.rules, parentQuery],
    };
    setQuery(nestedQuery);
    expect(getViewState().query).toEqual(nestedQuery);
    applySavedView({ id: "nested", query: nestedQuery });
    updateRow(0, { field: "source", operator: "eq", value: "x.com" });
    setCombinator("or");
    setSearchDraft("rating:5");
    expect(getViewState().query.rules).toContainEqual(parentQuery);
    expect(getViewState().query.not).toBe(true);
  });

  it("keeps OR conditions and group scope when editing through the filter toolbar", () => {
    applySavedView({
      id: "child",
      kind: "smart_folder",
      query: parentQuery,
      inheritedQuery: childQuery,
    });
    setSearchDraft("landscapes");
    updateLocalFilters([
      { field: "tags", operator: "some", value: ["illustration"] },
      { field: "tags", operator: "some", value: ["design"] },
    ]);
    expect(getViewState()).toMatchObject({
      combinator: "or",
      q: "landscapes",
      searchInput: "landscapes",
      inheritedQuery: childQuery,
    });
    const save = {
      id: "save",
      source: "instagram",
      url: "https://instagram.com/p/1",
      tags: ["design"],
    };
    expect(matches(effectiveQuery(), save)).toBe(true);
    expect(matches(effectiveQuery(), { ...save, tags: ["illustration"] })).toBe(
      true,
    );
    expect(matches(effectiveQuery(), { ...save, tags: ["branding"] })).toBe(
      false,
    );
    expect(
      matches(effectiveQuery(), {
        ...save,
        source: "twitter",
        url: "https://x.com/a/status/1",
      }),
    ).toBe(false);
  });

  it("leaves the group scope when resetting filters", () => {
    applySavedView({
      id: "child",
      query: childQuery,
      inheritedQuery: parentQuery,
    });
    resetFilters();
    expect(getViewState()).toMatchObject({
      query: EMPTY_QUERY,
      inheritedQuery: EMPTY_QUERY,
      activeViewId: null,
    });
  });
});

describe("folder presentation restoration", () => {
  it("restores independent folder settings and the global view on exit", () => {
    resetFilters();
    activateFolderPresentation(null);
    setLayout("waterfall");
    setSort({ key: "savedAt", dir: "desc" });
    const presentation = {
      layout: "grid" as const,
      sortKey: "random",
      sortDir: "asc" as const,
      zoom: 200,
      includeSubfolders: false,
      randomSeed: "seed-a",
      manualOrder: [],
      pinnedIds: [],
      coverSaveId: null,
    };
    activateFolderPresentation("a", presentation);
    expect(getViewState()).toMatchObject({
      layout: "grid",
      randomSeed: "seed-a",
      includeSubfolders: false,
      zoom: 200,
    });
    activateFolderPresentation("b", {
      ...presentation,
      layout: "list",
      randomSeed: "seed-b",
    });
    expect(getViewState()).toMatchObject({
      layout: "list",
      randomSeed: "seed-b",
    });
    activateFolderPresentation("a", presentation);
    expect(getViewState()).toMatchObject({
      layout: "grid",
      randomSeed: "seed-a",
      zoom: 200,
    });
    activateFolderPresentation(null);
    expect(getViewState()).toMatchObject({
      layout: "waterfall",
      sortKey: "savedAt",
      sortDir: "desc",
    });
  });
  it("preserves an explicitly selected saved view when leaving a folder", () => {
    activateFolderPresentation("a");
    applySavedView({
      id: "saved",
      kind: "saved_view",
      query: EMPTY_QUERY,
      layout: "justified",
      sortKey: "title",
      sortDir: "asc",
    });
    activateFolderPresentation(null);
    expect(getViewState()).toMatchObject({
      presentationFolderId: null,
      layout: "justified",
      sortKey: "title",
      sortDir: "asc",
    });
  });
});
