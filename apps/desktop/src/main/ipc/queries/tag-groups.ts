import { z } from "zod";
import type { QueryResult } from "../../../shared/query-contracts";
import {
  NonEmptyTextParam,
  query,
  StringListParam,
  StringParam,
} from "./params";
import type { QueryHandlerMap } from "./params";

type MergeGroupOperation = (
  from: string,
  to: string,
) => Promise<QueryResult<"tagGroups.merge">>;

const MergeGroupParams = z.object({
  from: z.string().trim().min(1),
  to: z.string().trim().min(1),
});

export function createMergeGroupQuery(operation: MergeGroupOperation) {
  return query(MergeGroupParams, async (params) =>
    operation(params.from, params.to),
  );
}

const mergeGroupOperation: MergeGroupOperation = async (from, to) => {
  const { mergeGroup } = await import("../../core/tag-groups");
  return mergeGroup(from, to);
};

export const tagGroupsQueries = {
  async "tagGroups.list"(): Promise<QueryResult<"tagGroups.list">> {
    const { listGroups } = await import("../../core/tag-groups");
    return await listGroups();
  },

  "tagGroups.create": query(
    z.object({ name: StringParam, color: NonEmptyTextParam }),
    async (params) => {
      const { createGroup } = await import("../../core/tag-groups");
      return await createGroup({ name: params.name, color: params.color });
    },
  ),

  "tagGroups.rename": query(
    z.object({ from: StringParam, to: StringParam }),
    async (params) => {
      const { renameGroup } = await import("../../core/tag-groups");
      return await renameGroup(params.from, params.to);
    },
  ),

  "tagGroups.update": query(
    z.object({
      name: StringParam,
      patch: z
        .object({
          name: z.string().optional(),
          description: z.string().nullable().optional(),
          color: z.string().nullable().optional(),
          sortOrder: z.number().optional(),
          collapsed: z.boolean().optional(),
        })
        .catch({}),
    }),
    async (params) => {
      const { updateGroup } = await import("../../core/tag-groups");
      return await updateGroup(params.name, params.patch);
    },
  ),

  "tagGroups.merge": createMergeGroupQuery(mergeGroupOperation),

  "tagGroups.delete": query(z.object({ name: StringParam }), async (params) => {
    const { deleteGroup } = await import("../../core/tag-groups");
    return await deleteGroup(params.name);
  }),

  "tagGroups.addTags": query(
    z.object({ tags: StringListParam, group: StringParam }),
    async (params) => {
      const { addTagsToGroup } = await import("../../core/tag-groups");
      return await addTagsToGroup(params.tags, params.group);
    },
  ),

  "tagGroups.removeTag": query(
    z.object({ tag: StringParam, group: StringParam }),
    async (params) => {
      const { removeTagFromGroup } = await import("../../core/tag-groups");
      return await removeTagFromGroup(params.tag, params.group);
    },
  ),
} satisfies QueryHandlerMap;
