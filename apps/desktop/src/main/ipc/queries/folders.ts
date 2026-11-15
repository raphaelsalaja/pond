import { RenameOptionsSchema } from "@shared/rename-template";
import { z } from "zod";
import { withMutationScope } from "../../core/executor";
import {
  NullableStringParam,
  type QueryHandlerMap,
  query,
  StringListParam,
  StringParam,
} from "./params";

export const foldersQueries = {
  "folders.createBatch": query(
    z.object({ names: StringListParam, parentId: NullableStringParam }),
    async (params) => {
      const { createFoldersBatch } = await import("../../core/folders");
      return createFoldersBatch(params);
    },
  ),
  "folders.createWithSaves": query(
    z.object({
      name: StringParam,
      parentId: NullableStringParam,
      saveIds: StringListParam,
    }),
    async (params) => {
      const { createFolderWithSaves } = await import("../../core/folders");
      return createFolderWithSaves(params);
    },
  ),
  "folders.moveBatch": query(
    z.object({
      ids: StringListParam,
      parentId: z.string().nullable(),
      beforeId: StringParam.optional(),
    }),
    async (params) => {
      const { moveFoldersBatch } = await import("../../core/folders");
      return moveFoldersBatch(params);
    },
  ),
  "folders.rules.get": query(z.object({ id: StringParam }), async (params) => {
    const { getFolderRules } = await import("../../core/folders");
    return getFolderRules(params.id);
  }),
  "folders.rules.set": query(
    z.object({
      id: StringParam,
      tags: StringListParam,
      applyExisting: z.boolean().optional(),
    }),
    async (params) => {
      const { setFolderRules } = await import("../../core/folders");
      return setFolderRules(params);
    },
  ),
  "folders.move": query(
    z.object({
      id: StringParam,
      parentId: z.string().nullable(),
      beforeId: z.string().optional(),
    }),
    async (params) => {
      const { moveFolder } = await import("../../core/folders");
      return moveFolder(params);
    },
  ),
  "folders.assign": query(
    z.object({
      saveIds: StringListParam,
      addIds: StringListParam,
      removeIds: StringListParam,
    }),
    async (params) =>
      withMutationScope(async () => {
        const { folderIdsForSave, assignSaveFolders } = await import(
          "../../core/folders"
        );
        const assignments: Array<{ saveId: string; folderIds: string[] }> = [];
        for (const id of new Set(params.saveIds)) {
          const current = await folderIdsForSave(id);
          const removed = new Set(params.removeIds);
          const next = [
            ...new Set([
              ...current.filter((folder) => !removed.has(folder)),
              ...params.addIds,
            ]),
          ];
          assignments.push({ saveId: id, folderIds: next });
        }
        return assignSaveFolders(assignments);
      }),
  ),
  "folders.list": query(z.object({}), async () => {
    const { listFolders } = await import("../../core/folders");
    return await listFolders();
  }),
  "folders.summaries": query(
    z.object({ parentId: StringParam }),
    async ({ parentId }) => {
      const { folderSummaries } = await import("../../core/folder-summaries");
      return folderSummaries(parentId);
    },
  ),
  "folders.previews": query(
    z.object({
      folderIds: StringListParam,
      limit: z.number().int().min(1).max(8).catch(4),
    }),
    async ({ folderIds, limit }) => {
      const { folderPreviews } = await import("../../core/folder-summaries");
      return folderPreviews(folderIds, limit);
    },
  ),
  "folders.downloading": query(
    z.object({ folderIds: StringListParam }),
    async ({ folderIds }) => {
      const { folderDownloadingCount } = await import(
        "../../core/folder-summaries"
      );
      return { count: await folderDownloadingCount(folderIds) };
    },
  ),
  "folders.metadata.get": query(
    z.object({ folderId: StringParam }),
    async ({ folderId }) => {
      const { getFolderMetadata } = await import("../../core/folder-metadata");
      return getFolderMetadata(folderId);
    },
  ),
  "folders.metadata.set": query(
    z.object({
      folderId: StringParam,
      description: z.string().max(4000).nullable(),
      externalLink: z.string().max(2048).nullable(),
    }),
    async ({ folderId, description, externalLink }) => {
      const { setFolderMetadata } = await import("../../core/folder-metadata");
      return setFolderMetadata(folderId, { description, externalLink });
    },
  ),
  "folders.create": query(
    z.object({
      name: StringParam,
      parentId: NullableStringParam,
      color: NullableStringParam,
    }),
    async (params) => {
      const { createFolder } = await import("../../core/folders");
      return await createFolder(params);
    },
  ),
  "folders.rename": query(
    z.object({ id: StringParam, name: StringParam }),
    async (params) => {
      const { renameFolder } = await import("../../core/folders");
      return await renameFolder(params.id, params.name);
    },
  ),
  "folders.renameBatch": query(
    RenameOptionsSchema.extend({ ids: StringListParam, pattern: StringParam }),
    async (params) => {
      const { renameFoldersBatch } = await import("../../core/folders");
      return renameFoldersBatch(params);
    },
  ),
  "folders.setColor": query(
    z.object({ id: StringParam, color: z.string().nullable() }),
    async (params) => {
      const { setFolderColor } = await import("../../core/folders");
      return await setFolderColor(params.id, params.color);
    },
  ),
  "folders.delete": query(
    z.object({
      id: StringParam,
      trashContainedSaves: z.boolean().optional(),
    }),
    async (params) => {
      const { deleteFolder } = await import("../../core/folders");
      return await deleteFolder(params.id, {
        trashContainedSaves: params.trashContainedSaves,
      });
    },
  ),
  "folders.memberships": query(z.object({}), async () => {
    const { memberships } = await import("../../core/folders");
    return await memberships();
  }),
  "folders.setSaveFolders": query(
    z.object({ saveId: StringParam, folderIds: StringListParam }),
    async (params) => {
      const { setSaveFolders } = await import("../../core/folders");
      return await setSaveFolders(params.saveId, params.folderIds);
    },
  ),
  "folders.addSaves": query(
    z.object({ folderId: StringParam, saveIds: StringListParam }),
    async (params) => {
      const { addSavesToFolder } = await import("../../core/folders");
      return await addSavesToFolder(params.folderId, params.saveIds);
    },
  ),
} satisfies QueryHandlerMap;
