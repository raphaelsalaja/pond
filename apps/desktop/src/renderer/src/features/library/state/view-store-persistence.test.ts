import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("filter persistence", () => {
  beforeEach(() => {
    vi.resetModules();
    const memory = new Map<string, string>();
    const localStorage = {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
    };
    vi.stubGlobal("localStorage", localStorage);
    vi.stubGlobal("window", { localStorage });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("leaves ad-hoc filters to the URL instead of a pref", async () => {
    const first = await import("./view-store");
    first.updateLocalFilters([
      { field: "type", operator: "eq", value: "video" },
    ]);
    first.setSemanticQuery("a black cat");
    expect(localStorage.getItem("pond.filterRules")).toBeNull();

    vi.resetModules();
    const second = await import("./view-store");
    const state = second.getViewState();
    expect(state.rows).toEqual([]);
    expect(state.semanticQuery).toBeNull();
  });

  it("hands filters from an older build over once", async () => {
    const legacy = {
      rows: [{ field: "type", operator: "eq", value: "video" }],
      combinator: "and",
      semanticQuery: "a black cat",
    };
    localStorage.setItem("pond.filterRules", JSON.stringify(legacy));
    const { takeLegacyFilters } = await import("./view-store");
    expect(takeLegacyFilters()).toEqual(legacy);
    expect(localStorage.getItem("pond.filterRules")).toBe("");
    expect(takeLegacyFilters()).toBeNull();
  });

  it("does not carry a saved view's rules into the next session", async () => {
    const first = await import("./view-store");
    first.applySavedView({
      id: "view-1",
      query: {
        combinator: "and",
        rules: [{ field: "rating", operator: "gte", value: 4 }],
      },
    });

    vi.resetModules();
    const second = await import("./view-store");
    expect(second.getViewState().rows).toEqual([]);
  });

  it("drops stored filters that no longer parse", async () => {
    localStorage.setItem("pond.filterRules", '{"rows":[{"field":"nope"}]}');
    const { getViewState, takeLegacyFilters } = await import("./view-store");
    expect(takeLegacyFilters()).toBeNull();
    expect(localStorage.getItem("pond.filterRules")).toBe("");
    expect(getViewState().rows).toEqual([]);
  });
});
