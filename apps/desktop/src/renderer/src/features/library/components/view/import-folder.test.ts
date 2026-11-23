import type { Folder } from "@pond/schema/db";
import { describe, expect, it } from "vitest";
import type { LibraryNav } from "@/features/library/state/library-chrome";
import { importFolderFor } from "./import-folder";

function folder(id: string, name: string, parentId: string | null): Folder {
  return {
    id,
    name,
    parentId,
    color: null,
    sortOrder: 0,
    createdAt: new Date(0),
  };
}

const design = folder("design", "Design", null);
const type = folder("type", "Type", "design");
const folders = [design, type];

describe("importFolderFor", () => {
  it("targets the exact nested folder on screen, not its parent", () => {
    expect(
      importFolderFor({
        mode: "library",
        nav: { kind: "folder", id: "type" },
        folders,
      }),
    ).toBe(type);
  });

  it("keeps the default destination outside a custom folder", () => {
    const views: LibraryNav[] = [
      { kind: "all" },
      { kind: "uncategorized" },
      { kind: "inbox" },
      { kind: "tag", name: "inspiration" },
    ];
    for (const nav of views) {
      expect(importFolderFor({ mode: "library", nav, folders })).toBe(
        undefined,
      );
    }
  });

  it("ignores a folder left in navigation behind another section", () => {
    expect(
      importFolderFor({
        mode: "trash",
        nav: { kind: "folder", id: "design" },
        folders,
      }),
    ).toBe(undefined);
  });

  it("has no destination when the folder no longer exists", () => {
    expect(
      importFolderFor({
        mode: "library",
        nav: { kind: "folder", id: "deleted" },
        folders,
      }),
    ).toBe(undefined);
  });
});
