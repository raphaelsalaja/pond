import type { FileRingItem } from "@pond/schema/file-ring";
import { describe, expect, it } from "vitest";
import {
  addRingItem,
  canAddRingItem,
  moveRingItem,
  removeRingItem,
} from "./file-ring-items";

const folder = (folderId: string): FileRingItem => ({
  kind: "folder",
  folderId,
});
const newFolder: FileRingItem = { kind: "action", action: "new-folder" };

describe("ring items", () => {
  const items = [newFolder, folder("a"), folder("b")];

  it("moves an item up or down by one", () => {
    expect(moveRingItem(items, 2, 1)).toEqual([
      newFolder,
      folder("b"),
      folder("a"),
    ]);
    expect(moveRingItem(items, 0, 1)).toEqual([
      folder("a"),
      newFolder,
      folder("b"),
    ]);
  });

  it("leaves the order alone past either end", () => {
    expect(moveRingItem(items, 0, -1)).toEqual(items);
    expect(moveRingItem(items, 2, 3)).toEqual(items);
  });

  it("removes the item at a position", () => {
    expect(removeRingItem(items, 1)).toEqual([newFolder, folder("b")]);
  });

  it("adds to the end, once per folder or action", () => {
    expect(addRingItem(items, folder("c"))).toEqual([...items, folder("c")]);
    expect(addRingItem(items, folder("a"))).toEqual(items);
    expect(canAddRingItem(items, newFolder)).toBe(false);
  });

  it("stops at six items", () => {
    const full = ["a", "b", "c", "d", "e", "f"].map(folder);
    expect(canAddRingItem(full, newFolder)).toBe(false);
    expect(addRingItem(full, newFolder)).toEqual(full);
  });
});
