import { SAVED_VIEW_KINDS } from "@pond/schema/db";
import { RenameOptionsSchema } from "@shared/rename-template";
import { z } from "zod";
import {
  NonEmptyTextParam,
  NullableStringParam,
  QueryParam,
  query,
  StringListParam,
  StringParam,
} from "./params";
import type { QueryHandlerMap } from "./params";

export const savedViewsQueries = {
  async "savedViews.list"() {
    const { listViews } = await import("../../core/saved-views");
    return await listViews();
  },

  "savedViews.create": query(
    z.object({
      name: StringParam,
      kind: z.enum(SAVED_VIEW_KINDS).optional(),
      parentId: z.string().nullable().optional(),
      question: NullableStringParam,
      query: QueryParam,
      sortKey: NonEmptyTextParam,
      sortDir: NonEmptyTextParam,
      layout: NullableStringParam,
    }),
    async (params) => {
      const { createView } = await import("../../core/saved-views");
      return await createView({
        name: params.name,
        kind: params.kind,
        parentId: params.parentId,
        question: params.question,
        query: params.query ?? undefined,
        sortKey: params.sortKey ?? undefined,
        sortDir: params.sortDir ?? undefined,
        layout: params.layout,
      });
    },
  ),

  "savedViews.rename": query(
    z.object({ id: StringParam, name: StringParam }),
    async (params) => {
      const { renameView } = await import("../../core/saved-views");
      return await renameView(params.id, params.name);
    },
  ),
  "savedViews.renameBatch": query(
    RenameOptionsSchema.extend({ ids: StringListParam, pattern: StringParam }),
    async (params) => {
      const { renameViewsBatch } = await import("../../core/saved-views");
      return renameViewsBatch(params);
    },
  ),

  "savedViews.update": query(
    z.object({
      id: StringParam,
      patch: z
        .object({
          name: z.string().optional(),
          parentId: z.string().nullable().optional(),
          question: z.string().nullable().optional(),
          query: QueryParam.transform((value) => value ?? undefined).optional(),
          sortKey: z.string().optional(),
          sortDir: z.string().optional(),
          layout: z.string().nullable().optional(),
          sortOrder: z.number().optional(),
        })
        .catch({}),
    }),
    async (params) => {
      const { updateView } = await import("../../core/saved-views");
      return await updateView(params.id, params.patch);
    },
  ),

  "savedViews.delete": query(z.object({ id: StringParam }), async (params) => {
    const { deleteView } = await import("../../core/saved-views");
    return await deleteView(params.id);
  }),

  "savedViews.reorder": query(
    z.object({ ids: StringListParam }),
    async (params) => {
      const { reorderViews } = await import("../../core/saved-views");
      return await reorderViews(params.ids);
    },
  ),
} satisfies QueryHandlerMap;
