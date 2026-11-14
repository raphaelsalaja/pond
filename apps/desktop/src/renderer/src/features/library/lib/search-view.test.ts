import { describe, expect, it } from "vitest";
import {
  canSearchAllSaves,
  searchViewFor,
  searchViewName,
} from "./search-view";

describe("search view", () => {
  it.each([
    ["library", { kind: "all" }, { kind: "library" }],
    ["library", { kind: "random" }, { kind: "library" }],
    ["library", { kind: "folder", id: "a" }, { kind: "folder", id: "a" }],
    ["library", { kind: "tag", name: "ui" }, { kind: "tag", name: "ui" }],
    ["library", { kind: "uncategorized" }, { kind: "uncategorized" }],
    ["untagged", { kind: "untagged" }, { kind: "untagged" }],
    ["recentlyAdded", { kind: "recentlyAdded" }, { kind: "recentlyAdded" }],
    ["recents", { kind: "recents" }, { kind: "recents" }],
    ["trash", { kind: "trash" }, { kind: "trash" }],
  ] as const)("reads %s with %o as %o", (mode, nav, view) => {
    expect(searchViewFor(mode, nav)).toEqual(view);
  });

  it("offers All Saves only from views narrower than the Library", () => {
    expect(canSearchAllSaves({ kind: "folder", id: "a" })).toBe(true);
    expect(canSearchAllSaves({ kind: "recents" })).toBe(true);
    expect(canSearchAllSaves({ kind: "library" })).toBe(false);
    expect(canSearchAllSaves({ kind: "trash" })).toBe(false);
  });

  it("names a folder view after the folder", () => {
    const folders = [{ id: "a", name: "Design" }];
    expect(searchViewName({ kind: "folder", id: "a" }, folders)).toBe("Design");
    expect(searchViewName({ kind: "folder", id: "gone" }, folders)).toBe(
      "Folder",
    );
  });
});
