import { z } from "zod";
import type { QueryResult } from "../../../shared/query-contracts";
import {
  NullableStringParam,
  query,
  StringListParam,
  StringParam,
} from "./params";
import type { QueryHandlerMap } from "./params";

const NameParams = z.object({ name: StringParam });
const RenameParams = z.object({ from: StringParam, to: StringParam });

export const tagsQueries = {
  async "tags.list"() {
    const { listTags } = await import("../../core/tags");
    return await listTags();
  },

  "tags.create": query(NameParams, async (params) => {
    const { createTag } = await import("../../core/tags");
    return await createTag({ name: params.name });
  }),

  "tags.rename": query(RenameParams, async (params) => {
    const { renameTag } = await import("../../core/tags");
    return await renameTag(params.from, params.to);
  }),

  "tags.merge": query(RenameParams, async (params) => {
    const { mergeTags } = await import("../../core/tags");
    return await mergeTags(params.from, params.to);
  }),

  "tags.update": query(
    z.object({
      name: StringParam,
      patch: z
        .looseObject({
          starred: z.coerce.boolean().optional(),
          description: NullableStringParam.optional(),
        })
        .catch({}),
    }),
    async (params) => {
      const { updateTag } = await import("../../core/tags");
      const patch: Parameters<typeof updateTag>[1] = {};
      if ("starred" in params.patch) patch.starred = params.patch.starred;
      if ("description" in params.patch) {
        patch.description = params.patch.description;
      }
      return await updateTag(params.name, patch);
    },
  ),

  "tags.delete": query(NameParams, async (params) => {
    const { deleteTag } = await import("../../core/tags");
    return await deleteTag(params.name);
  }),

  "tags.convertToGroup": query(
    NameParams,
    async (params): Promise<QueryResult<"tags.convertToGroup">> => {
      const { createGroup } = await import("../../core/tag-groups");
      const { deleteTag } = await import("../../core/tags");
      const name = params.name.trim();
      if (!name) return { ok: false, error: "Enter a tag name." };
      const created = await createGroup({ name });
      if (!created.ok) return created;
      await deleteTag(name);
      return { ok: true };
    },
  ),

  "tags.setForSave": query(
    z.object({ saveId: StringParam, tags: StringListParam }),
    async (params) => {
      const { setSaveTags } = await import("../../core/tags");
      return await setSaveTags(params.saveId, params.tags);
    },
  ),
} satisfies QueryHandlerMap;
