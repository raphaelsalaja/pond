import { expect, it } from "vitest";
import { folderOptions } from "./folder-options";

const folder = (id: string, parentId: string | null, sortOrder: number) => ({
  id,
  name: id,
  parentId,
  color: null,
  sortOrder,
});

it("lists folders in sidebar order under their parents", () => {
  const rows = folderOptions([
    folder("b", null, 1),
    folder("a1", "a", 0),
    folder("a", null, 0),
    folder("orphan", "gone", 2),
  ]);
  expect(rows.map((row) => [row.folder.id, row.depth])).toEqual([
    ["a", 0],
    ["a1", 1],
    ["b", 0],
    ["orphan", 0],
  ]);
});
