import { createTagOperations } from "./tag-operations";
import type { TagClient } from "./tag-operations";

const client: TagClient = {
  async create(kind, name) {
    await window.pond.query(
      kind === "group" ? "tagGroups.create" : "tags.create",
      { name },
    );
  },
  async rename(kind, from, to) {
    await window.pond.query(
      kind === "group" ? "tagGroups.rename" : "tags.rename",
      { from, to },
    );
  },
  async deleteTag(name) {
    await window.pond.query("tags.delete", { name });
  },
  async merge(from, to) {
    await window.pond.query("tags.merge", { from, to });
  },
  async addToGroup(tag, group) {
    await window.pond.query("tagGroups.addTags", { tags: [tag], group });
  },
  async removeFromGroup(tag, group) {
    await window.pond.query("tagGroups.removeTag", { tag, group });
  },
};

export const tagOperations = createTagOperations(client);
