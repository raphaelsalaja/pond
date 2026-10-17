import { describe, expect, it } from "vitest";
import { addCollectionEntry } from "./collection-entries";

describe("addCollectionEntry", () => {
  it("keeps the first copy and records every collection", () => {
    const entries = new Map<
      string,
      { title: string; collectionIds?: string[] }
    >();
    addCollectionEntry(entries, "1", { title: "first" }, "a");
    addCollectionEntry(entries, "1", { title: "second" }, "b");
    addCollectionEntry(entries, "1", { title: "third" }, "a");
    expect(entries.get("1")).toEqual({
      title: "first",
      collectionIds: ["a", "b"],
    });
  });
});
