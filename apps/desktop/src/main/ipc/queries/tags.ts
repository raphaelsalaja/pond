import { saves, type tags } from "@pond/schema/db";
import { getDb } from "../../db";
import type { QueryHandlerMap } from "../helpers";

export const tagsQueries: QueryHandlerMap = {
  async "tags.list"() {
    const { listTags } = await import("../../core/tags");
    return await listTags();
  },

  async "tags.create"(params) {
    const { createTag } = await import("../../core/tags");
    return await createTag({
      name: String(params.name ?? ""),
      color: params.color ? String(params.color) : null,
      description: params.description ? String(params.description) : null,
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
    const counts = new Map<string, number>();
    for (const row of all) {
      if (row.deletedAt) continue;
      for (const t of row.tags ?? []) {
        const key = String(t).toLowerCase();
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).map(([name, count]) => ({
      name,
      userCount: count,
      aiCount: 0,
    }));
  },
};
