import { describe, expect, it } from "vitest";
import type { Save } from "@/features/saves/types";
import { createRowJoiner } from "./stable-rows";

function save(id: string, title: string | null = null): Save {
  return {
    id,
    source: "twitter",
    sourceId: id,
    url: "",
    title,
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

describe("createRowJoiner", () => {
  it("returns the same array while no Save or membership changed", () => {
    const join = createRowJoiner();
    const a = save("a");
    const b = save("b");
    const memberships = { a: ["folder"] };
    const first = join([a, b], memberships);
    expect(first.map((row) => row.folderIds)).toEqual([["folder"], []]);
    expect(join([a, b], { ...memberships })).toBe(first);
  });

  it("rebuilds only the row whose Save changed", () => {
    const join = createRowJoiner();
    const a = save("a");
    const b = save("b");
    const first = join([a, b], {});
    const renamed = save("b", "renamed");
    const second = join([a, renamed], {});
    expect(second).not.toBe(first);
    expect(second[0]).toBe(first[0]);
    expect(second[1]?.title).toBe("renamed");
  });

  it("rebuilds a row when its folder membership changes", () => {
    const join = createRowJoiner();
    const a = save("a");
    const first = join([a], { a: ["one"] });
    const second = join([a], { a: ["one", "two"] });
    expect(second[0]).not.toBe(first[0]);
    expect(second[0]?.folderIds).toEqual(["one", "two"]);
  });

  it("returns a new array when rows are added, removed or reordered", () => {
    const join = createRowJoiner();
    const a = save("a");
    const b = save("b");
    const first = join([a, b], {});
    const reordered = join([b, a], {});
    expect(reordered).not.toBe(first);
    expect(reordered.map((row) => row.id)).toEqual(["b", "a"]);
    expect(join([b], {}).map((row) => row.id)).toEqual(["b"]);
  });
});
