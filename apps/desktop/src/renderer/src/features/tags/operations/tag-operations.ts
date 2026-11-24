import { normalizeLabelName } from "@pond/schema/label-name";

export type TagEntity = "tag" | "group";

export interface TagClient {
  create: (kind: TagEntity, name: string) => Promise<void>;
  rename: (kind: TagEntity, from: string, to: string) => Promise<void>;
  deleteTag: (name: string) => Promise<void>;
  merge: (from: string, to: string) => Promise<void>;
  addToGroup: (tag: string, group: string) => Promise<void>;
  removeFromGroup: (tag: string, group: string) => Promise<void>;
}

export function createTagOperations(client: TagClient) {
  return {
    async create(kind: TagEntity, raw: string) {
      const name = normalizeLabelName(raw);
      if (name) {
        await client.create(kind, name);
      }
    },
    async rename(kind: TagEntity, from: string, raw: string) {
      const to = kind === "group" ? raw.trim() : normalizeLabelName(raw);
      if (!to) {
        return;
      }
      if (
        kind === "group" ? from === to : from.toLowerCase() === to.toLowerCase()
      ) {
        return;
      }
      await client.rename(kind, from, to);
    },
    async deleteTags(names: Array<string>) {
      for (const name of names) {
        await client.deleteTag(name);
      }
    },
    async mergeTags(names: Array<string>, raw: string) {
      const to = normalizeLabelName(raw);
      if (!to) {
        return;
      }
      for (const name of names) {
        if (name.toLowerCase() !== to.toLowerCase()) {
          await client.merge(name, to);
        }
      }
    },
    async addToGroup(tag: string, group: string) {
      await client.addToGroup(tag, group);
    },
    async removeFromGroup(tag: string, group: string) {
      await client.removeFromGroup(tag, group);
    },
    async moveToGroup(tag: string, from: string, to: string) {
      if (from === to) {
        return;
      }
      await client.addToGroup(tag, to);
      await client.removeFromGroup(tag, from);
    },
  };
}
