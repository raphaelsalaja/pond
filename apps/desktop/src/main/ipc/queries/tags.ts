import { saves, tags } from "@pond/schema/db";
import { getDb } from "../../db";
import type { QueryHandlerMap } from "../helpers";

export const tagsQueries: QueryHandlerMap = {
  async "tags.list"() {
    const db = await getDb();
    return await db.select().from(tags);
  },

  async "tags.create"(params) {
    const { createTag } = await import("../../core/tags");
    return await createTag({
      name: String(params.name ?? ""),
      color: params.color ? String(params.color) : null,
      group: params.group ? String(params.group) : null,
    });
  },

  async "tags.update"(params) {
    const { updateTag } = await import("../../core/tags");
    const name = String(params.name ?? "");
    const patch = (params.patch as Record<string, unknown>) ?? {};
    return await updateTag(name, patch as Partial<typeof tags.$inferInsert>);
  },

  async "tags.rename"(params) {
    const { renameTag } = await import("../../core/tags");
    return await renameTag(String(params.from ?? ""), String(params.to ?? ""));
  },

  async "tags.merge"(params) {
    const { mergeTags } = await import("../../core/tags");
    return await mergeTags(String(params.from ?? ""), String(params.to ?? ""));
  },

  async "tags.delete"(params) {
    const { deleteTag } = await import("../../core/tags");
    return await deleteTag(String(params.name ?? ""));
  },

  async "tags.setForSave"(params) {
    const { setSaveTags } = await import("../../core/tags");
    return await setSaveTags(
      String(params.saveId ?? ""),
      Array.isArray(params.tags) ? (params.tags as string[]) : [],
    );
  },

  async "tags.allFromSaves"() {
    const db = await getDb();
    const all = await db.select().from(saves);
    const counts = new Map<string, { user: number; ai: number }>();
    for (const row of all) {
      if (row.deletedAt) continue;
      for (const t of row.tags ?? []) {
        const key = String(t).toLowerCase();
        const entry = counts.get(key) ?? { user: 0, ai: 0 };
        entry.user += 1;
        counts.set(key, entry);
      }
      for (const t of row.aiTags ?? []) {
        const key = String(t).toLowerCase();
        const entry = counts.get(key) ?? { user: 0, ai: 0 };
        entry.ai += 1;
        counts.set(key, entry);
      }
    }
    return Array.from(counts.entries()).map(([name, c]) => ({
      name,
      userCount: c.user,
      aiCount: c.ai,
    }));
  },
};
