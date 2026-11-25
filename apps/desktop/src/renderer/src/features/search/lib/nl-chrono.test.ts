import type { Predicate } from "@pond/schema/filters/types";
import { describe, expect, it } from "vitest";
import { extractDates } from "@/features/search/lib/nl-chrono";

const REF = new Date(2024, 5, 15);

const preds = (input: string): Array<Predicate> =>
  extractDates(input, REF).predicates;
const rest = (input: string): string =>
  extractDates(input, REF).rest.replaceAll(/\s+/g, " ").trim();

describe("extractDates — rolling windows", () => {
  it("maps curated phrases to relative ISO durations (>= now - N)", () => {
    expect(preds("last 3 months")).toEqual([
      { field: "savedAt", operator: "gte", value: "-P3M" },
    ]);
    expect(preds("recently")).toEqual([
      { field: "savedAt", operator: "gte", value: "-P1W" },
    ]);
  });

  it("honors a date-field qualifier and consumes it", () => {
    expect(preds("published last week")).toEqual([
      { field: "publishedAt", operator: "gte", value: "-P1W" },
    ]);
    expect(rest("published last week")).toBe("");
  });

  it("leaves non-date words in the rest", () => {
    expect(rest("videos from last 3 months")).toBe("videos");
  });
});

describe("extractDates — absolute dates and years", () => {
  it("treats a bare year as its full-year window", () => {
    expect(preds("from 2023")).toEqual([
      {
        field: "savedAt",
        operator: "between",
        value: ["2023-01-01", "2024-01-01"],
      },
    ]);
  });

  it("applies direction to years", () => {
    expect(preds("before 2020")).toEqual([
      { field: "savedAt", operator: "lt", value: "2020-01-01" },
    ]);
    expect(preds("after 2021")).toEqual([
      { field: "savedAt", operator: "gte", value: "2022-01-01" },
    ]);
    expect(preds("since 2022")).toEqual([
      { field: "savedAt", operator: "gte", value: "2022-01-01" },
    ]);
  });

  it("widens a month reference to the whole month", () => {
    expect(preds("march 2023")).toEqual([
      {
        field: "savedAt",
        operator: "between",
        value: ["2023-03-01", "2023-04-01"],
      },
    ]);
  });

  it("combines qualifier + direction on an absolute date", () => {
    expect(preds("published before march 2023")).toEqual([
      { field: "publishedAt", operator: "lt", value: "2023-03-01" },
    ]);
  });
});

describe("extractDates — relative and ranges", () => {
  it("resolves 'two weeks ago' against the reference date", () => {
    expect(preds("two weeks ago")).toEqual([
      {
        field: "savedAt",
        operator: "between",
        value: ["2024-06-01", "2024-06-02"],
      },
    ]);
  });

  it("resolves 'yesterday' to a single calendar day", () => {
    expect(preds("yesterday")).toEqual([
      {
        field: "savedAt",
        operator: "between",
        value: ["2024-06-14", "2024-06-15"],
      },
    ]);
  });

  it("parses an open range", () => {
    expect(preds("between march and june 2023")).toEqual([
      {
        field: "savedAt",
        operator: "between",
        value: ["2023-03-01", "2023-07-01"],
      },
    ]);
  });
});

describe("extractDates — non-dates are left alone", () => {
  it("does not eat media durations", () => {
    expect(preds("longer than 5 minutes")).toEqual([]);
    expect(rest("longer than 5 minutes")).toBe("longer than 5 minutes");
  });

  it("returns nothing for date-free input", () => {
    expect(preds("red images with no caption")).toEqual([]);
  });
});
