import { afterEach, describe, expect, it, vi } from "vitest";
import { saveLibraryBridge } from "@/features/saves/lib/library-bridge";
import type { Save } from "@/features/saves/types";
import { factFilters } from "./fact-actions";

function makeSave(partial: Partial<Save>): Save {
  return {
    id: "save",
    source: "local",
    sourceId: "save",
    url: "",
    title: null,
    description: null,
    author: null,
    notes: null,
    mediaUrl: null,
    mediaType: "image",
    files: [
      {
        kind: "image",
        path: "shot.PNG",
        mimeType: "image/png",
        sha256: "abcdef1234567890",
        size: 92_000,
      },
    ],
    tags: [],
    savedAt: 0,
    createdAt: 0,
    deletedAt: null,
    ...partial,
  };
}

function filtersFor(id: string, value: string, save: Save) {
  const spy = vi
    .spyOn(saveLibraryBridge, "showMatching")
    .mockImplementation(() => {});
  return factFilters({ id, value, display: value }, save).map((filter) => {
    filter.run();
    return { label: filter.label, predicate: spy.mock.lastCall?.[0] };
  });
}

describe("factFilters", () => {
  afterEach(() => vi.restoreAllMocks());

  it("filters by format, then by media type", () => {
    expect(filtersFor("type", "PNG", makeSave({}))).toEqual([
      {
        label: "Show PNG Saves",
        predicate: { field: "format", operator: "some", value: ["png"] },
      },
      {
        label: "Show Image Saves",
        predicate: { field: "type", operator: "eq", value: "image" },
      },
    ]);
  });

  it("filters dimensions by shape and aspect", () => {
    const labels = filtersFor(
      "dimensions",
      "1920 × 1080",
      makeSave({ width: 1920, height: 1080 }),
    ).map((filter) => filter.label);
    expect(labels).toEqual(["Show Landscape Saves", "Show 16:9 Saves"]);
  });

  it("filters a saved date to that whole local day", () => {
    const savedAt = new Date(2026, 9, 25, 14, 30).getTime();
    const [filter] = filtersFor(
      "imported",
      "Oct 25, 2026",
      makeSave({ savedAt }),
    );
    expect(filter?.label).toBe("Show Saves from Oct 25, 2026");
    expect(filter?.predicate).toEqual({
      field: "savedAt",
      operator: "between",
      value: [
        new Date(2026, 9, 25).getTime(),
        new Date(2026, 9, 26).getTime() - 1,
      ],
    });
  });

  it("has no filter for the ID", () => {
    expect(filtersFor("id", "01ABC", makeSave({}))).toEqual([]);
  });
});
