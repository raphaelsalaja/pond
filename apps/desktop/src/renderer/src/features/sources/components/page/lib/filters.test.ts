import { describe, expect, it } from "vitest";
import {
  defaultSourceFilters,
  matchesSourceFilters,
  sourceFiltersActive,
  sourceStatusId,
} from "./filters";
import type { FilterableSource } from "./filters";

function row(
  partial: Partial<FilterableSource> & Pick<FilterableSource, "name">,
): FilterableSource {
  return {
    handle: null,
    source: "twitter",
    sourceLabel: "Twitter",
    kind: "account",
    kindLabel: "Account",
    statusId: "active",
    ...partial,
  };
}

describe("sourceStatusId", () => {
  it("maps a running sync to syncing", () => {
    expect(sourceStatusId("run", true)).toBe("syncing");
  });

  it("maps a disconnected idle source to offline", () => {
    expect(sourceStatusId("idle", false)).toBe("offline");
  });

  it("maps a connected idle source to active", () => {
    expect(sourceStatusId("idle", true)).toBe("active");
    expect(sourceStatusId("ok", true)).toBe("active");
  });
});

describe("matchesSourceFilters", () => {
  const raphael = row({
    name: "Raphael",
    handle: "raphael",
    source: "twitter",
    sourceLabel: "Twitter",
  });

  it("shows every row when no search or filters are set", () => {
    expect(matchesSourceFilters(raphael, defaultSourceFilters())).toBe(true);
    expect(sourceFiltersActive(defaultSourceFilters())).toBe(false);
    expect(
      sourceFiltersActive({
        ...defaultSourceFilters(),
        q: "raphael",
      }),
    ).toBe(false);
  });

  it("matches search against name, handle, and source", () => {
    const filters = defaultSourceFilters();
    filters.q = "raph";
    expect(matchesSourceFilters(raphael, filters)).toBe(true);
    filters.q = "twitter";
    expect(matchesSourceFilters(raphael, filters)).toBe(true);
    filters.q = "missing";
    expect(matchesSourceFilters(raphael, filters)).toBe(false);
  });

  it("keeps only the chosen status, source, and type", () => {
    const failedWatch = row({
      name: "Design",
      source: "youtube",
      sourceLabel: "YouTube",
      kind: "watch",
      kindLabel: "Playlist",
      statusId: "failed",
    });
    expect(
      matchesSourceFilters(raphael, {
        ...defaultSourceFilters(),
        statuses: new Set(["failed"]),
      }),
    ).toBe(false);
    expect(
      matchesSourceFilters(failedWatch, {
        ...defaultSourceFilters(),
        statuses: new Set(["failed"]),
      }),
    ).toBe(true);
    expect(
      matchesSourceFilters(failedWatch, {
        ...defaultSourceFilters(),
        sources: new Set(["twitter"]),
      }),
    ).toBe(false);
    expect(
      matchesSourceFilters(failedWatch, {
        ...defaultSourceFilters(),
        types: new Set(["Account"]),
      }),
    ).toBe(false);
    expect(
      matchesSourceFilters(failedWatch, {
        ...defaultSourceFilters(),
        statuses: new Set(["failed"]),
        sources: new Set(["youtube"]),
        types: new Set(["Playlist"]),
      }),
    ).toBe(true);
  });
});
