import { describe, expect, it } from "vitest";
import { folderTemplateRows } from "./tree";

describe("folderTemplateRows", () => {
  it("lists folders parents first with their depth", () => {
    const rows = folderTemplateRows([
      { key: "c", parentKey: "b", name: "C" },
      { key: "a", parentKey: null, name: "A" },
      { key: "b", parentKey: "a", name: "B" },
    ]);
    expect(rows.map((row) => [row.node.name, row.depth])).toEqual([
      ["A", 0],
      ["B", 1],
      ["C", 2],
    ]);
  });

  it("shows nothing for an invalid template", () => {
    expect(
      folderTemplateRows([{ key: "a", parentKey: "missing", name: "A" }]),
    ).toEqual([]);
  });
});
