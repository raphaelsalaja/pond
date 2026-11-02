import { describe, expect, it } from "vitest";
import {
  createTagOperations,
  type TagClient,
  type TagEntity,
} from "./tag-operations";

function setup() {
  const tags = new Set(["Animation", "Typography"]);
  const groups = new Map<string, Set<string>>([
    ["Design", new Set(["Animation"])],
    ["Motion", new Set()],
  ]);
  const entities = (kind: TagEntity) =>
    kind === "tag" ? tags : new Set(groups.keys());
  const client: TagClient = {
    async create(kind, name) {
      if (kind === "tag") tags.add(name);
      else if (!groups.has(name)) groups.set(name, new Set());
    },
    async rename(kind, from, to) {
      if (!entities(kind).has(from)) throw new Error("Missing label");
      if (kind === "tag") {
        tags.delete(from);
        tags.add(to);
        for (const members of groups.values())
          if (members.delete(from)) members.add(to);
      } else {
        const members = groups.get(from);
        if (!members) throw new Error("Missing group");
        groups.delete(from);
        groups.set(to, members);
      }
    },
    async deleteTag(name) {
      tags.delete(name);
      for (const members of groups.values()) members.delete(name);
    },
    async merge(from, to) {
      tags.delete(from);
      tags.add(to);
      for (const members of groups.values())
        if (members.delete(from)) members.add(to);
    },
    async addToGroup(tag, group) {
      const members = groups.get(group);
      if (!members) throw new Error("Missing group");
      members.add(tag);
    },
    async removeFromGroup(tag, group) {
      groups.get(group)?.delete(tag);
    },
  };
  return { tags, groups, operations: createTagOperations(client) };
}

describe("tag operations", () => {
  it("normalizes creation names and ignores empty drafts for either presentation", async () => {
    const { operations, tags, groups } = setup();
    await operations.create("tag", "  New   Tag  ");
    await operations.create("group", "  New   Group  ");
    await operations.create("tag", "   ");
    expect([...tags]).toEqual(["Animation", "Typography", "New Tag"]);
    expect(groups.has("New Group")).toBe(true);
  });

  it("keeps accented and non-Latin letters when a tag is created", async () => {
    const { operations, tags } = setup();
    await operations.create("tag", " Données ");
    await operations.create("tag", "数据");
    await operations.create("tag", "!!!");
    await operations.rename("tag", "Données", "Données!");
    expect([...tags]).toEqual(["Animation", "Typography", "Données", "数据"]);
  });

  it("preserves tag case-only rename and group case rename behavior", async () => {
    const { operations, tags, groups } = setup();
    await operations.rename("tag", "Animation", " animation ");
    await operations.rename("group", "Design", " design ");
    expect(tags.has("Animation")).toBe(true);
    expect(groups.has("design")).toBe(true);
    await operations.rename("tag", "Animation", " Motion   Design ");
    expect(groups.get("design")).toEqual(new Set(["Motion Design"]));
  });

  it("moves membership only after adding to the destination succeeds", async () => {
    const { operations, groups } = setup();
    await expect(
      operations.moveToGroup("Animation", "Design", "Missing"),
    ).rejects.toThrow("Missing group");
    expect(groups.get("Design")).toEqual(new Set(["Animation"]));
    await operations.moveToGroup("Animation", "Design", "Motion");
    expect(groups.get("Design")).toEqual(new Set());
    expect(groups.get("Motion")).toEqual(new Set(["Animation"]));
    await operations.moveToGroup("Animation", "Motion", "Motion");
    expect(groups.get("Motion")).toEqual(new Set(["Animation"]));
  });

  it("merges selected tags without merging the target into itself", async () => {
    const { operations, tags, groups } = setup();
    await operations.mergeTags(["Animation", "Typography"], " Typography ");
    expect(tags).toEqual(new Set(["Typography"]));
    expect(groups.get("Design")).toEqual(new Set(["Typography"]));
    await operations.deleteTags(["Typography"]);
    expect(tags.size).toBe(0);
    expect(groups.get("Design")?.size).toBe(0);
  });
});
