import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  applySavedView,
  getViewState,
  initialViewState,
  resetFilters,
  setSemanticQuery,
  takeLegacyFilters,
  updateLocalFilters,
} from "./view-store";

describe("filter persistence", () => {
  beforeEach(() => {
    localStorage.removeItem("pond.filterRules");
    resetFilters();
  });

  afterEach(() => {
    localStorage.removeItem("pond.filterRules");
    resetFilters();
  });

  it("leaves ad-hoc filters to the URL instead of a pref", () => {
    updateLocalFilters([{ field: "type", operator: "eq", value: "video" }]);
    setSemanticQuery("a black cat");
    expect(localStorage.getItem("pond.filterRules")).toBeNull();

    const next = initialViewState();
    expect(next.rows).toEqual([]);
    expect(next.semanticQuery).toBeNull();
  });

  it("hands filters from an older build over once", () => {
    const legacy = {
      rows: [{ field: "type", operator: "eq", value: "video" }],
      combinator: "and",
      semanticQuery: "a black cat",
    };
    localStorage.setItem("pond.filterRules", JSON.stringify(legacy));
    expect(takeLegacyFilters()).toEqual(legacy);
    expect(localStorage.getItem("pond.filterRules")).toBe("");
    expect(takeLegacyFilters()).toBeNull();
  });

  it("does not carry a saved view's rules into the next session", () => {
    applySavedView({
      id: "view-1",
      query: {
        combinator: "and",
        rules: [{ field: "rating", operator: "gte", value: 4 }],
      },
    });
    expect(getViewState().activeViewId).toBe("view-1");

    expect(initialViewState().rows).toEqual([]);
  });

  it("drops stored filters that no longer parse", () => {
    localStorage.setItem("pond.filterRules", '{"rows":[{"field":"nope"}]}');
    expect(takeLegacyFilters()).toBeNull();
    expect(localStorage.getItem("pond.filterRules")).toBe("");
    expect(initialViewState().rows).toEqual([]);
  });
});
