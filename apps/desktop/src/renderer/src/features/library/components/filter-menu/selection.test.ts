import { matches } from "@pond/schema/filters/match";
import type { Predicate, Query } from "@pond/schema/filters/types";
import { describe, expect, it } from "vitest";
import { parseSearchInput, serializeQuery } from "@/features/search/lib/syntax";
import {
  choiceOptions,
  FILTER_GROUPS,
  fieldMatchesQuery,
  presetOptions,
} from "./options";
import { isFilterSelected, selectFilter } from "./selection";

const image: Predicate = { field: "type", operator: "eq", value: "image" };
const video: Predicate = { field: "type", operator: "eq", value: "video" };
const tagged: Predicate = {
  field: "tags",
  operator: "some",
  value: ["design"],
};
const query = (rules: Array<Predicate>): Query => ({
  combinator: "and",
  rules,
});

describe("filter menu selections", () => {
  it("matches either selected type while still requiring the selected tag", () => {
    const rows = selectFilter(selectFilter([tagged], image, true), video, true);
    const filter = query(rows);
    const save = { id: "save", source: "local", url: "", tags: ["design"] };
    expect(matches(filter, { ...save, mediaType: "image" })).toBe(true);
    expect(matches(filter, { ...save, mediaType: "video" })).toBe(true);
    expect(matches(filter, { ...save, mediaType: "text" })).toBe(false);
    expect(matches(filter, { ...save, mediaType: "image", tags: [] })).toBe(
      false,
    );
    expect(isFilterSelected(rows, image)).toBe(true);
    expect(isFilterSelected(rows, video)).toBe(true);
  });

  it("removes only the unchecked choice, and drops the field when none remain", () => {
    let rows = selectFilter([tagged, image], video, true);
    rows = selectFilter(rows, image, false);
    expect(rows).toEqual([tagged, video]);
    rows = selectFilter(rows, video, false);
    expect(rows).toEqual([tagged]);
  });

  it("recognizes typed selections without duplicating case variants", () => {
    const typed = parseSearchInput("type:image,video tag:Design").predicates;
    expect(isFilterSelected(typed, image)).toBe(true);
    expect(isFilterSelected(typed, tagged)).toBe(true);
    expect(
      selectFilter(typed, tagged, true).filter((row) => row.field === "tags"),
    ).toEqual([tagged]);
  });

  it("replaces a date range without dropping other categories", () => {
    const old: Predicate = { field: "savedAt", operator: "gte", value: "-P1W" };
    const next: Predicate = {
      field: "savedAt",
      operator: "between",
      value: ["2026-08-01T00:00:00.000Z", "2026-08-30T23:59:59.999Z"],
    };
    expect(selectFilter([image, old], next, true)).toEqual([image, next]);
    expect(selectFilter([image, next], next, false)).toEqual([image]);
  });

  it("does not mistake excluded types for checked choices", () => {
    const excluded: Predicate = {
      field: "type",
      operator: "neq",
      value: "text",
    };
    expect(isFilterSelected([excluded], { ...image, value: "text" })).toBe(
      false,
    );
    expect(selectFilter([excluded], image, true)).toEqual([excluded, image]);
  });

  it("combines folder IDs while displaying their names", () => {
    const options = choiceOptions("folder", [
      { label: "Design", value: "folder-a" },
      { label: "Motion", value: "folder-b" },
    ]);
    const first = options[0];
    const second = options[1];
    if (!first || !second) throw new Error("Missing folder choices");
    const rows = selectFilter([first.predicate], second.predicate, true);
    expect(
      matches(query(rows), {
        id: "save",
        source: "local",
        url: "",
        folderIds: ["FOLDER-B"],
      }),
    ).toBe(true);
    expect(
      matches(query(rows), {
        id: "save",
        source: "local",
        url: "",
        folderIds: [],
      }),
    ).toBe(false);
  });

  it("round-trips every preset through the search bar", () => {
    for (const field of FILTER_GROUPS.flat()) {
      for (const option of presetOptions(field)) {
        const parsed = parseSearchInput(
          serializeQuery(query([option.predicate])),
        );
        expect(parsed.text, `${field}: ${option.label}`).toBe("");
        expect(parsed.predicates, `${field}: ${option.label}`).toEqual([
          option.predicate,
        ]);
      }
    }
  });

  it("filters categories by field or value label", () => {
    const types = presetOptions("type");
    expect(fieldMatchesQuery("type", "", types)).toBe(true);
    expect(fieldMatchesQuery("type", "typ", types)).toBe(true);
    expect(fieldMatchesQuery("type", "video", types)).toBe(true);
    expect(fieldMatchesQuery("type", "zzz", types)).toBe(false);
    expect(fieldMatchesQuery("tags", "video", [])).toBe(false);
  });

  it("preserves free text when serializing selected filters", () => {
    const parsed = parseSearchInput(
      `${serializeQuery(query([image, tagged]))} design systems`,
    );
    expect(parsed.text).toBe("design systems");
    expect(parsed.predicates).toEqual([image, tagged]);
  });
});
