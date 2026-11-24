import type { DeepPartial, Folder, Prefs } from "@pond/schema/db";
import { FolderTemplateSchema } from "@pond/schema/folder-templates";
import type { FolderTemplate } from "@pond/schema/folder-templates";
import { inverse } from "@pond/schema/tx";
import type { Transaction } from "@pond/schema/tx";
import {
  BUILT_IN_FOLDER_TEMPLATES,
  duplicateTemplateName,
} from "@shared/folder-templates";
import type { OkSuccess, UndoableChange } from "@shared/query-contracts-shared";
import log from "electron-log/main.js";
import { ulid } from "ulid";
import { executeBatch, withMutationScope } from "./executor";
import {
  buildFolderTemplate,
  planFolderTemplate,
} from "./folder-template-plan";
import type { FolderTemplatePlan } from "./folder-template-plan";
import { listFolders } from "./folders";
import { getPrefs, removeFolderPrefs, setPrefs } from "./prefs";
import { normalizeTagList } from "./tags";
import { recordBatchForUndo } from "./undo";
import type { UndoEffects } from "./undo";

export interface FolderTemplateRuntime {
  run<T>(operation: () => Promise<T>): Promise<T>;
  listFolders(): Promise<Array<Folder>>;
  getPrefs(): Promise<Prefs>;
  setPrefs(patch: DeepPartial<Prefs>): Promise<void>;
  removeFolderPrefs(ids: ReadonlyArray<string>): Promise<void>;
  execute(transactions: Array<Transaction>): Promise<void>;
  recordUndo(
    transactions: Array<Transaction>,
    effects?: UndoEffects,
  ): string | null;
  createId: () => string;
}

const defaultRuntime: FolderTemplateRuntime = {
  run: withMutationScope,
  listFolders,
  getPrefs,
  setPrefs: async (patch) => {
    await setPrefs(patch);
  },
  removeFolderPrefs: async (ids) => {
    await removeFolderPrefs(ids);
  },
  execute: async (transactions) => {
    await executeBatch(transactions);
  },
  recordUndo: recordBatchForUndo,
  createId: ulid,
};

export async function listFolderTemplates(
  runtime: FolderTemplateRuntime = defaultRuntime,
): Promise<{
  builtIn: ReadonlyArray<FolderTemplate>;
  custom: Array<FolderTemplate>;
}> {
  return {
    builtIn: BUILT_IN_FOLDER_TEMPLATES,
    custom: (await runtime.getPrefs()).folderTemplates.custom,
  };
}

function findFolderTemplate(
  id: string,
  custom: ReadonlyArray<FolderTemplate>,
): FolderTemplate {
  const template = [...BUILT_IN_FOLDER_TEMPLATES, ...custom].find(
    (entry) => entry.id === id,
  );
  if (!template) {
    throw new Error("This template no longer exists.");
  }
  return template;
}

function templateSettings(plan: FolderTemplatePlan): DeepPartial<Prefs> | null {
  const folderRules = Object.fromEntries(
    Object.entries(plan.automaticTags).map(([id, tags]) => [
      id,
      { automaticTags: normalizeTagList(tags) },
    ]),
  );
  if (!Object.keys(plan.views).length && !Object.keys(folderRules).length) {
    return null;
  }
  return { folderViews: plan.views, folderRules };
}

export function applyFolderTemplate(
  input: {
    templateId: string;
    parentId?: string | null;
    name?: string;
  },
  runtime: FolderTemplateRuntime = defaultRuntime,
): Promise<{ rootId: string; count: number } & UndoableChange> {
  return runtime.run(async () => {
    const template = findFolderTemplate(
      input.templateId,
      (await runtime.getPrefs()).folderTemplates.custom,
    );
    const existing = await runtime.listFolders();
    const parentId = input.parentId ?? null;
    if (parentId && !existing.some((row) => row.id === parentId)) {
      throw new Error("Destination folder no longer exists.");
    }
    const plan = planFolderTemplate({
      template,
      parentId,
      rootName: input.name,
      existing,
      createId: runtime.createId,
    });
    const root = plan.folders[0];
    if (!root) {
      throw new Error("A template needs exactly one top folder.");
    }
    const txs: Array<Transaction> = plan.folders.map((data) => ({
      kind: "create",
      model: "folder",
      id: data.id,
      data,
      meta: { actor: "user", actorReason: "folder-template" },
    }));
    await runtime.execute(txs);
    const settings = templateSettings(plan);
    if (settings) {
      try {
        await runtime.setPrefs(settings);
      } catch (error) {
        await runtime
          .execute([...txs].reverse().map(inverse))
          .catch((cause: unknown) =>
            log.warn("[pond folder templates] rollback failed", cause),
          );
        throw error;
      }
    }
    const ids = plan.folders.map((folder) => folder.id);
    const undoId = runtime.recordUndo(
      txs,
      settings
        ? {
            undo: () => runtime.removeFolderPrefs(ids),
            redo: () => runtime.setPrefs(settings),
          }
        : undefined,
    );
    return { rootId: root.id, count: plan.folders.length, undoId };
  });
}

export function saveFolderAsTemplate(
  input: {
    folderId: string;
    includeSubfolders: boolean;
    name: string;
    description?: string;
  },
  runtime: FolderTemplateRuntime = defaultRuntime,
): Promise<FolderTemplate> {
  return runtime.run(async () => {
    const prefs = await runtime.getPrefs();
    const template = buildFolderTemplate({
      ...input,
      folders: await runtime.listFolders(),
      views: prefs.folderViews,
      rules: prefs.folderRules,
      createId: runtime.createId,
    });
    await runtime.setPrefs({
      folderTemplates: { custom: [...prefs.folderTemplates.custom, template] },
    });
    return template;
  });
}

export function duplicateFolderTemplate(
  input: { templateId: string },
  runtime: FolderTemplateRuntime = defaultRuntime,
): Promise<FolderTemplate> {
  return runtime.run(async () => {
    const custom = (await runtime.getPrefs()).folderTemplates.custom;
    const source = findFolderTemplate(input.templateId, custom);
    const copy = FolderTemplateSchema.parse({
      ...source,
      id: `custom:${runtime.createId()}`,
      name: duplicateTemplateName(
        source.name,
        [...BUILT_IN_FOLDER_TEMPLATES, ...custom].map((entry) => entry.name),
      ),
    });
    await runtime.setPrefs({ folderTemplates: { custom: [...custom, copy] } });
    return copy;
  });
}

export function deleteFolderTemplate(
  input: { templateId: string },
  runtime: FolderTemplateRuntime = defaultRuntime,
): Promise<OkSuccess> {
  return runtime.run(async () => {
    const custom = (await runtime.getPrefs()).folderTemplates.custom;
    await runtime.setPrefs({
      folderTemplates: {
        custom: custom.filter((entry) => entry.id !== input.templateId),
      },
    });
    return { ok: true };
  });
}
