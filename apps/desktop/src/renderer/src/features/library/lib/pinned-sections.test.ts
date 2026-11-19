import { describe, expect, it } from "vitest";
import { splitPinned } from "./pinned-sections";

const saves = ["a", "b", "c", "d"].map((id) => ({ id }));

describe("splitPinned", () => {
  it("keeps the folder's Saves as Contents when nothing is pinned", () => {
    const result = splitPinned(saves, []);

    expect(result.pinned).toEqual([]);
    expect(result.contents).toBe(saves);
  });

  it("moves pinned Saves out of Contents in pin order", () => {
    const result = splitPinned(saves, ["c", "a"]);

    expect(result.pinned.map((save) => save.id)).toEqual(["c", "a"]);
    expect(result.contents.map((save) => save.id)).toEqual(["b", "d"]);
  });

  it("skips pins the current results don't hold", () => {
    const result = splitPinned(saves, ["gone", "d"]);

    expect(result.pinned.map((save) => save.id)).toEqual(["d"]);
    expect(result.contents.map((save) => save.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps Contents identical when no pin matches", () => {
    expect(splitPinned(saves, ["gone"]).contents).toBe(saves);
  });
});
