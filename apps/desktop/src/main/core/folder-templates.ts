import type { FolderTemplate } from "@pond/schema/folder-templates";
import type { Transaction } from "@pond/schema/tx";
import { BUILT_IN_FOLDER_TEMPLATES } from "@shared/folder-templates";
import type { UndoableChange } from "@shared/query-contracts-shared";
import { ulid } from "ulid";
import { executeBatch, withMutationScope } from "./executor";
import {
  buildFolderTemplate,
  planFolderTemplate,
} from "./folder-template-plan";
import { listFolders } from "./folders";
import { getPrefs, setPrefs } from "./prefs";
import { normalizeTagList } from "./tags";
import { recordBatchForUndo } from "./undo";

export async function listFolderTemplates(): Promise<{
  builtIn: readonly FolderTemplate[];
  custom: FolderTemplate[];
}> {
  return {
    builtIn: BUILT_IN_FOLDER_TEMPLATES,
    custom: (await getPrefs()).folderTemplates.custom,
  };
}

async function findFolderTemplate(id: string): Promise<FolderTemplate> {
  const { builtIn, custom } = await listFolderTemplates();
  const template = [...builtIn, ...custom].find((entry) => entry.id === id);
  if (!template) throw new Error("This template no longer exists.");
  return template;
}

export function applyFolderTemplate(input: {
  templateId: string;
  parentId?: string | null;
  name?: string;
}): Promise<{ rootId: string; count: number } & UndoableChange> {
  return withMutationScope(async () => {
    const template = await findFolderTemplate(input.templateId);
    const existing = await listFolders();
    const parentId = input.parentId ?? null;
    if (parentId && !existing.some((row) => row.id === parentId))
      throw new Error("Destination folder no longer exists.");
    const plan = planFolderTemplate({
      template,
      parentId,
      rootName: input.name,
      existing,
      createId: ulid,
    });
    const root = plan.folders[0];
    if (!root) throw new Error("A template needs exactly one top folder.");
    const txs: Transaction[] = plan.folders.map((data) => ({
      kind: "create",
      model: "folder",
      id: data.id,
      data,
      meta: { actor: "user", actorReason: "folder-template" },
    }));
    await executeBatch(txs);
    const undoId = recordBatchForUndo(txs);
    const folderRules = Object.fromEntries(
      Object.entries(plan.automaticTags).map(([id, tags]) => [
        id,
        { automaticTags: normalizeTagList(tags) },
      ]),
    );
    if (Object.keys(plan.views).length || Object.keys(folderRules).length)
      await setPrefs({ folderViews: plan.views, folderRules });
    return { rootId: root.id, count: plan.folders.length, undoId };
  });
}

export function saveFolderAsTemplate(input: {
  folderId: string;
  includeSubfolders: boolean;
  name: string;
  description?: string;
}): Promise<FolderTemplate> {
  return withMutationScope(async () => {
    const prefs = await getPrefs();
    const template = buildFolderTemplate({
      ...input,
      folders: await listFolders(),
      views: prefs.folderViews,
      rules: prefs.folderRules,
      createId: ulid,
    });
    await setPrefs({
      folderTemplates: { custom: [...prefs.folderTemplates.custom, template] },
    });
    return template;
  });
}
