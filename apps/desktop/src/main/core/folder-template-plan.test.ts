import {
  type FolderTemplate,
  orderFolderTemplateNodes,
} from "@pond/schema/folder-templates";
import { BUILT_IN_FOLDER_TEMPLATES } from "@shared/folder-templates";
import { describe, expect, it } from "vitest";
import {
  buildFolderTemplate,
  planFolderTemplate,
} from "./folder-template-plan";

function ids() {
  let next = 0;
  return () => `id-${next++}`;
}

const template: FolderTemplate = {
  id: "t",
  name: "Project",
  nodes: [
    { key: "a", parentKey: "root", name: "Drafts", icon: "pencil" },
    {
      key: "root",
      parentKey: null,
      name: "Project",
      color: "blue",
      automaticTags: ["work"],
      view: { layout: "list", sortDir: "asc" },
    },
    { key: "b", parentKey: "root", name: "Final" },
    { key: "c", parentKey: "a", name: "Old" },
  ],
};

function folder(
  id: string,
  parentId: string | null,
  sortOrder: number,
  name = id,
) {
  const color: string | null = null;
  return { id, parentId, name, color, sortOrder };
}

describe("orderFolderTemplateNodes", () => {
  it("puts parents before children", () => {
    expect(
      orderFolderTemplateNodes(template.nodes).map((node) => node.key),
    ).toEqual(["root", "a", "c", "b"]);
  });

  it("rejects duplicate keys, extra roots, missing parents, and loops", () => {
    const root = { key: "r", parentKey: null, name: "R" };
    expect(() => orderFolderTemplateNodes([root, root])).toThrow();
    expect(() =>
      orderFolderTemplateNodes([root, { ...root, key: "s" }]),
    ).toThrow();
    expect(() =>
      orderFolderTemplateNodes([root, { key: "x", parentKey: "y", name: "X" }]),
    ).toThrow();
    expect(() =>
      orderFolderTemplateNodes([
        root,
        { key: "x", parentKey: "y", name: "X" },
        { key: "y", parentKey: "x", name: "Y" },
      ]),
    ).toThrow();
  });

  it("accepts every built-in template", () => {
    for (const entry of BUILT_IN_FOLDER_TEMPLATES)
      expect(orderFolderTemplateNodes(entry.nodes)).toHaveLength(
        entry.nodes.length,
      );
  });
});

describe("planFolderTemplate", () => {
  it("creates fresh folders under the destination with remapped parents", () => {
    const plan = planFolderTemplate({
      template,
      parentId: "parent",
      rootName: "  Client A ",
      existing: [folder("x", "parent", 4), folder("y", null, 9)],
      createId: ids(),
    });
    expect(plan.folders).toEqual([
      {
        id: "id-0",
        parentId: "parent",
        name: "Client A",
        color: "blue",
        sortOrder: 5,
      },
      {
        id: "id-1",
        parentId: "id-0",
        name: "Drafts",
        color: null,
        sortOrder: 0,
      },
      { id: "id-2", parentId: "id-1", name: "Old", color: null, sortOrder: 0 },
      {
        id: "id-3",
        parentId: "id-0",
        name: "Final",
        color: null,
        sortOrder: 1,
      },
    ]);
    expect(plan.views).toEqual({
      "id-0": { layout: "list", sortDir: "asc" },
      "id-1": { icon: "pencil" },
    });
    expect(plan.automaticTags).toEqual({ "id-0": ["work"] });
  });

  it("keeps the template name when the root name is blank", () => {
    const plan = planFolderTemplate({
      template,
      parentId: null,
      rootName: " ",
      existing: [],
      createId: ids(),
    });
    expect(plan.folders[0]).toMatchObject({ name: "Project", sortOrder: 0 });
  });
});

describe("buildFolderTemplate", () => {
  const folders = [
    { ...folder("p", null, 0, "Project"), color: "#AABBCC" },
    folder("b", "p", 1, "Final"),
    folder("a", "p", 0, "Drafts"),
    folder("other", null, 1),
  ];
  const views = {
    p: {
      icon: "rocket" as const,
      layout: "grid" as const,
      sortKey: "title",
      sortDir: "asc" as const,
      zoom: 200,
      includeSubfolders: false,
      randomSeed: "seed",
      manualOrder: ["s1"],
      pinnedIds: ["s2"],
      coverSaveId: "s3",
    },
  };

  it("copies structure and transferable settings, not Save state", () => {
    const built = buildFolderTemplate({
      folderId: "p",
      includeSubfolders: true,
      name: "Mine",
      description: " ",
      folders,
      views,
      rules: { p: { automaticTags: ["client"] } },
      createId: () => "1",
    });
    expect(built.id).toBe("custom:1");
    expect(built.description).toBeUndefined();
    expect(built.nodes).toEqual([
      {
        key: "folder-0",
        parentKey: null,
        name: "Project",
        color: "#aabbcc",
        icon: "rocket",
        automaticTags: ["client"],
        view: {
          layout: "grid",
          sortKey: "title",
          sortDir: "asc",
          zoom: 200,
          includeSubfolders: false,
        },
      },
      { key: "folder-1", parentKey: "folder-0", name: "Drafts", color: null },
      { key: "folder-2", parentKey: "folder-0", name: "Final", color: null },
    ]);
  });

  it("copies only the folder itself when subfolders are left out", () => {
    const built = buildFolderTemplate({
      folderId: "p",
      includeSubfolders: false,
      name: "Mine",
      folders,
      views: {},
      rules: {},
      createId: () => "2",
    });
    expect(built.nodes).toHaveLength(1);
  });
});
