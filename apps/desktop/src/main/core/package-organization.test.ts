import { describe, expect, it } from "vitest";
import {
  mergePackageOrganization,
  PackageOrganizationSchema,
} from "./package-organization";

function organization() {
  return PackageOrganizationSchema.parse({
    folderRules: { folder: { automaticTags: ["Print"] } },
    folderViews: {
      folder: {
        layout: "list",
        icon: "album",
        sortKey: "manual",
        manualOrder: ["source-save", "unselected"],
        randomSeed: "source-seed",
      },
    },
    views: [
      {
        id: "group",
        name: "Projects",
        kind: "group",
        parent_id: null,
        question: null,
        query: JSON.stringify({ combinator: "and", rules: [] }),
        sort_key: "savedAt",
        sort_dir: "desc",
        layout: null,
        sort_order: 0,
        created_at: 10,
      },
      {
        id: "view",
        name: "Posters",
        kind: "smart_folder",
        parent_id: "group",
        question: "Keep this prompt",
        query: JSON.stringify({
          combinator: "or",
          not: true,
          rules: [{ field: "folder", operator: "some", value: ["folder"] }],
        }),
        sort_key: "title",
        sort_dir: "asc",
        layout: "list",
        sort_order: 1,
        created_at: 20,
      },
    ],
    tags: [
      {
        id: "tag",
        name: "Print",
        description: "Print projects",
        starred: true,
        archived: false,
        lastUsedAt: 10,
        usageCount: 2,
        createdAt: 1,
      },
    ],
    groups: [
      {
        id: "tags",
        name: "Work",
        description: "My work",
        color: "red",
        sortOrder: 0,
        collapsed: true,
        createdAt: 1,
      },
    ],
    members: [{ tagId: "tag", groupId: "tags", sortOrder: 0 }],
  });
}
describe("portable library organization", () => {
  it("remaps nested view parents and folder rules, preserves settings and tag metadata, and repeats idempotently", () => {
    const incoming = organization();
    const folders = new Map([["folder", "new-folder"]]);
    const merged = mergePackageOrganization(
      PackageOrganizationSchema.parse({ views: [] }),
      incoming,
      folders,
      new Map([["source-save", "target-save"]]),
    );
    const group = merged.views.find((view) => view.kind === "group");
    const view = merged.views.find((row) => row.kind === "smart_folder");
    expect(view?.parent_id).toBe(group?.id);
    expect(JSON.parse(view?.query ?? "null")).toEqual({
      combinator: "or",
      not: true,
      rules: [{ field: "folder", operator: "some", value: ["new-folder"] }],
    });
    expect(view?.question).toBe("Keep this prompt");
    expect(merged.folderViews["new-folder"]).toMatchObject({
      layout: "list",
      icon: "album",
      randomSeed: "source-seed",
      manualOrder: ["target-save"],
    });
    expect(merged.folderRules["new-folder"]).toEqual({
      automaticTags: ["Print"],
    });
    expect(view?.layout).toBe("list");
    expect(merged.groups[0]?.description).toBe("My work");
    expect(merged.tags[0]?.starred).toBe(true);
    expect(merged.members[0]?.tagId).toBe(merged.tags[0]?.id);
    expect(mergePackageOrganization(merged, incoming, folders)).toEqual(merged);
  });
  it("rejects lost folder predicates or cyclic groups instead of broadening membership", () => {
    const incoming = organization();
    const empty = PackageOrganizationSchema.parse({ views: [] });
    expect(() => mergePackageOrganization(empty, incoming, new Map())).toThrow(
      "missing folder",
    );
    const group = incoming.views[0];
    if (!group) throw new Error("Missing test group");
    group.parent_id = group.id;
    expect(() =>
      mergePackageOrganization(
        empty,
        incoming,
        new Map([["folder", "mapped"]]),
      ),
    ).toThrow("hierarchy");
  });
  it("unions case-insensitive tag/group names while retaining existing metadata", () => {
    const existing = organization();
    const incoming = organization();
    const tag = incoming.tags[0];
    if (!tag) throw new Error("Missing test tag");
    tag.name = "PRINT";
    tag.description = "Replacement";
    const merged = mergePackageOrganization(
      existing,
      incoming,
      new Map([["folder", "folder"]]),
    );
    expect(merged.tags).toEqual(existing.tags);
    expect(merged.members).toEqual(existing.members);
  });
});
