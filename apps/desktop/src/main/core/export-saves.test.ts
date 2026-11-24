import type { savedViews } from "@pond/schema/db";
import type { Query } from "@pond/schema/filters/types";
import { describe, expect, it } from "vitest";
import type { ExportFolder, ExportItem } from "./export-files";
import { exportName, selectionViews } from "./export-saves";

function view(
  id: string,
  input: {
    kind?: "saved_view" | "smart_folder" | "group";
    parentId?: string | null;
    query?: Query;
  } = {},
): typeof savedViews.$inferSelect {
  return {
    id,
    name: id,
    kind: input.kind ?? "saved_view",
    parentId: input.parentId ?? null,
    question: null,
    query: input.query ?? { combinator: "and", not: false, rules: [] },
    sortKey: "savedAt",
    sortDir: "desc",
    layout: null,
    sortOrder: 0,
    createdAt: new Date(1),
  };
}

describe("selection organization export", () => {
  it("keeps compatible views and their groups without broadening lost folder predicates", () => {
    const rows = [
      view("group", { kind: "group" }),
      view("included", {
        kind: "smart_folder",
        parentId: "group",
        query: {
          combinator: "and",
          not: false,
          rules: [
            { field: "folder", operator: "some", value: ["selected-folder"] },
          ],
        },
      }),
      view("missing-folder", {
        query: {
          combinator: "and",
          not: false,
          rules: [
            { field: "folder", operator: "some", value: ["other-folder"] },
          ],
        },
      }),
      view("global"),
    ];

    expect(
      selectionViews(rows, new Set(["selected-folder"])).map((row) => row.id),
    ).toEqual(["group", "included", "global"]);
  });
});

const item = (title: string): ExportItem => ({
  directory: "",
  folderIds: ["geoid"],
  save: { id: title, title, url: "", tags: [], notes: "", files: [] },
});

describe("export names", () => {
  const now = new Date(2026, 10, 22);
  const folders: Array<ExportFolder> = [
    { id: "projects", name: "Projects", parentId: null },
    { id: "geoid", name: "Geoid", parentId: "projects" },
  ];

  it("names a single Save after its title even when it's filed in a folder", () => {
    expect(exportName([item("Survey")], folders, {}, now)).toBe(
      "Survey (Pond Export 2026-11-22)",
    );
  });

  it("names a folder export after the folder even when it holds one Save", () => {
    expect(
      exportName([item("Survey")], folders, { fromFolders: true }, now),
    ).toBe("Geoid (Pond Export 2026-11-22)");
  });

  it("names several Saves after their shared folder", () => {
    expect(exportName([item("A"), item("B")], folders, {}, now)).toBe(
      "Geoid (Pond Export 2026-11-22)",
    );
  });
});
