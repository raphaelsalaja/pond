import { describe, expect, it } from "vitest";
import type { Save } from "@/features/saves/types";
import { retainTagPickerSaves } from "./retain-tag-picker-saves";

function save(id: string): Save {
  return {
    id,
    source: "twitter",
    sourceId: id,
    url: "",
    title: null,
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: null,
    files: [],
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
  };
}

function ids(rows: readonly Save[]): string[] {
  return rows.map((row) => row.id);
}

describe("retainTagPickerSaves", () => {
  it("puts a departed save back where it was while the picker holds it", () => {
    const previous = [save("a"), save("leaving"), save("b")];
    const current = [save("a"), save("b")];
    const retained = retainTagPickerSaves(current, ["leaving"], previous);
    expect(ids(retained.rows)).toEqual(["a", "leaving", "b"]);
    expect(retained.departedIds).toEqual(["leaving"]);
  });

  it("keeps several departed saves in their previous order", () => {
    const previous = [save("a"), save("x"), save("b"), save("y")];
    const current = [save("a"), save("b")];
    const retained = retainTagPickerSaves(current, ["y", "x"], previous);
    expect(ids(retained.rows)).toEqual(["a", "x", "b", "y"]);
  });

  it("drops the save once nothing is holding it", () => {
    const previous = [save("a"), save("leaving"), save("b")];
    const current = [save("a"), save("b")];
    const retained = retainTagPickerSaves(current, [], previous);
    expect(retained.rows).toBe(current);
    expect(retained.departedIds).toEqual([]);
  });

  it("does not invent a save the page never showed", () => {
    const current = [save("a")];
    const retained = retainTagPickerSaves(current, ["missing"], []);
    expect(retained.rows).toBe(current);
  });
});
