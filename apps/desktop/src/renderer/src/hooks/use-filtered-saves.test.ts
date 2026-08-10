import { queryIsFullySqlSupported } from "@pond/schema/filters";
import { matches } from "@pond/schema/filters/match";
import { describe, expect, it } from "vitest";
import { parseSearchInput } from "@/lib/search/syntax";
import type { Save } from "@/lib/types";
import {
  intersectSqlResults,
  needsFullPoolHydration,
} from "./use-filtered-saves";

function save(id: string): Save {
  return { id } as Save;
}

describe("intersectSqlResults", () => {
  it("does not reintroduce filter matches outside the current search results", () => {
    const searchHits = [save("search-and-filter"), save("search-only")];

    expect(
      intersectSqlResults(searchHits, ["filter-only", "search-and-filter"]),
    ).toEqual([searchHits[0]]);
  });

  it("keeps the ordering returned by the SQL filter", () => {
    const first = save("first");
    const second = save("second");

    expect(intersectSqlResults([first, second], ["second", "first"])).toEqual([
      second,
      first,
    ]);
  });
});

describe("needsFullPoolHydration", () => {
  it("keeps the paged fast path only for the default recency order", () => {
    expect(needsFullPoolHydration(true, false, "savedAt", "desc")).toBe(false);
    expect(needsFullPoolHydration(true, false, "title", "asc")).toBe(true);
    expect(needsFullPoolHydration(true, false, "savedAt", "asc")).toBe(true);
  });

  it("hydrates client-only filters but trusts complete SQL query results", () => {
    expect(needsFullPoolHydration(false, false, "savedAt", "desc")).toBe(true);
    expect(needsFullPoolHydration(false, true, "title", "asc")).toBe(false);
  });
});

describe("queryIsFullySqlSupported", () => {
  it("keeps source filters in memory instead of compiling them to an empty SQL condition", () => {
    expect(
      queryIsFullySqlSupported({
        combinator: "and",
        rules: [{ field: "source", operator: "eq", value: "instagram.com" }],
      }),
    ).toBe(false);
  });

  it("rejects mixed queries when any nested predicate is client-only", () => {
    expect(
      queryIsFullySqlSupported({
        combinator: "and",
        rules: [
          { field: "type", operator: "eq", value: "video" },
          {
            combinator: "or",
            rules: [
              { field: "source", operator: "eq", value: "instagram.com" },
            ],
          },
        ],
      }),
    ).toBe(false);
  });

  it("allows projected fields and the special tags projection", () => {
    expect(
      queryIsFullySqlSupported({
        combinator: "and",
        rules: [
          { field: "type", operator: "eq", value: "video" },
          { field: "tags", operator: "some", value: ["design"] },
        ],
      }),
    ).toBe(true);
  });
});

describe("structured source search", () => {
  it("matches the requested domain and excludes other platforms", () => {
    const parsed = parseSearchInput("source:instagram.com");
    const query = { combinator: "and" as const, rules: parsed.predicates };

    expect(parsed.text).toBe("");
    expect(
      matches(query, {
        id: "instagram-save",
        source: "instagram",
        url: "https://www.instagram.com/p/example",
      }),
    ).toBe(true);
    expect(
      matches(query, {
        id: "tiktok-save",
        source: "tiktok",
        url: "https://www.tiktok.com/@example/video/1",
      }),
    ).toBe(false);
  });
});
