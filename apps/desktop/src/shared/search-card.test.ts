import { describe, expect, it } from "vitest";
import { searchCardFromSave } from "./search-card";

const url = "https://www.google.com/search?q=malaga";

describe("searchCardFromSave", () => {
  it("reads the engine and query and points at a large favicon for the engine", () => {
    expect(
      searchCardFromSave({
        url,
        rawJson: {
          capture: {
            id: url,
            source: "web",
            url,
            media: [],
            extras: { search: { engine: "Google Search", query: "malaga" } },
          },
          extractorId: "web",
          extractedAt: "2026-11-22T00:00:00.000Z",
        },
      }),
    ).toEqual({
      engine: "Google Search",
      query: "malaga",
      iconUrl:
        "https://www.google.com/s2/favicons?domain=www.google.com&sz=128",
    });
  });

  it("returns null for Saves that are not search pages", () => {
    expect(searchCardFromSave({ url, rawJson: null })).toBeNull();
    expect(
      searchCardFromSave({
        url,
        rawJson: {
          capture: {
            id: url,
            source: "web",
            url,
            media: [],
            extras: { search: { engine: "Google Search", query: " " } },
          },
          extractorId: "web",
          extractedAt: "2026-11-22T00:00:00.000Z",
        },
      }),
    ).toBeNull();
  });
});
