import { describe, expect, it } from "vitest";
import {
  canSearchAllSaves,
  searchViewFor,
  searchViewName,
} from "./search-view";

describe("search view", () => {
  it.each([
    [{ kind: "all" }, { kind: "library" }],
    [{ kind: "random" }, { kind: "library" }],
    [{ kind: "folder", id: "a" }, { kind: "folder", id: "a" }],
    [{ kind: "tag", name: "ui" }, { kind: "tag", name: "ui" }],
    [{ kind: "uncategorized" }, { kind: "uncategorized" }],
    [{ kind: "untagged" }, { kind: "untagged" }],
    [{ kind: "recentlyAdded" }, { kind: "recentlyAdded" }],
    [{ kind: "recents" }, { kind: "recents" }],
    [{ kind: "trash" }, { kind: "trash" }],
  ] as const)("reads %o as %o", (nav, view) => {
    expect(searchViewFor(nav)).toEqual(view);
  });

  it("reads a page with no collection as the Library", () => {
    expect(searchViewFor(null)).toEqual({ kind: "library" });
  });

  it("offers All Saves only from folders and tags", () => {
    expect(canSearchAllSaves({ kind: "folder", id: "a" })).toBe(true);
    expect(canSearchAllSaves({ kind: "tag", name: "a" })).toBe(true);
    expect(canSearchAllSaves({ kind: "recents" })).toBe(false);
    expect(canSearchAllSaves({ kind: "recentlyAdded" })).toBe(false);
    expect(canSearchAllSaves({ kind: "untagged" })).toBe(false);
    expect(canSearchAllSaves({ kind: "uncategorized" })).toBe(false);
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
