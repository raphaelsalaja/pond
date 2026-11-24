import type { Predicate } from "@pond/schema/filters/types";
import { describe, expect, it } from "vitest";
import { compileStageA, EMPTY_FACETS } from "@/features/search/lib/nl-query";

const rules = (input: string): Array<Predicate> =>
  compileStageA(input, EMPTY_FACETS).query.rules;

describe("compileStageA — dates compose with the rest of the compiler", () => {
  it("pairs a rolling date with a type and a sort", () => {
    const res = compileStageA("newest videos from last month", EMPTY_FACETS);
    expect(res.query.rules).toEqual(
      expect.arrayContaining([
        { field: "type", operator: "eq", value: "video" },
        { field: "savedAt", operator: "gte", value: "-P1M" },
      ]),
    );
    expect(res.sort).toEqual({ key: "savedAt", dir: "desc" });
    expect(res.residual).toBe("");
  });

  it("reads '5 minutes' as a duration, not a date", () => {
    const res = rules("videos longer than 5 minutes");
    expect(res).toEqual(
      expect.arrayContaining([
        { field: "type", operator: "eq", value: "video" },
        { field: "duration", operator: "gt", value: 300 },
      ]),
    );
    expect(res.some((p) => p.field === "savedAt")).toBe(false);
  });

  it("scopes an absolute date to the qualified field", () => {
    expect(rules("images published in 2023")).toEqual(
      expect.arrayContaining([
        { field: "type", operator: "eq", value: "image" },
        {
          field: "publishedAt",
          operator: "between",
          value: ["2023-01-01", "2024-01-01"],
        },
      ]),
    );
  });

  it("keeps unmatched words as residual", () => {
    const res = compileStageA("sunset photos", EMPTY_FACETS);
    expect(res.query.rules).toContainEqual({
      field: "type",
      operator: "eq",
      value: "image",
    });
    expect(res.residual).toBe("sunset");
  });

  it("reads liked as a list filter", () => {
    expect(rules("liked videos")).toEqual(
      expect.arrayContaining([
        { field: "list", operator: "some", value: ["liked"] },
        { field: "type", operator: "eq", value: "video" },
      ]),
    );
  });
});

describe("compileStageA — product type", () => {
  it("reads 'products' as the Product type", () => {
    const res = compileStageA("products", EMPTY_FACETS);
    expect(res.query.rules).toEqual([
      { field: "type", operator: "eq", value: "product" },
    ]);
    expect(res.residual).toBe("");
  });
});
