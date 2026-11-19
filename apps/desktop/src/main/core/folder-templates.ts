import type { Folder, NewFolder, Prefs } from "@pond/schema/db";
import { FolderColorSchema } from "@pond/schema/folder-presentation";
import {
  type FolderTemplate,
  type FolderTemplateNode,
  FolderTemplateSchema,
  type FolderTemplateView,
  orderFolderTemplateNodes,
} from "@pond/schema/folder-templates";
import type { Transaction } from "@pond/schema/tx";
import { BUILT_IN_FOLDER_TEMPLATES } from "@shared/folder-templates";
import type { UndoableChange } from "@shared/query-contracts-shared";
import { ulid } from "ulid";
import { executeBatch, withMutationScope } from "./executor";
import { listFolders } from "./folders";
import { getPrefs, setPrefs } from "./prefs";
import { normalizeTagList } from "./tags";
import { recordBatchForUndo } from "./undo";

type FolderView = Partial<Prefs["folderViews"][string]>;

export interface FolderTemplatePlan {
  folders: NewFolder[];
  views: Record<string, FolderView>;
  automaticTags: Record<string, string[]>;
}

/** Gives every template folder a fresh ID, so a template never shares folders or Saves with what it was made from. */
export function planFolderTemplate(input: {
  template: FolderTemplate;
  parentId: string | null;
  rootName?: string;
  existing: readonly Pick<Folder, "parentId" | "sortOrder">[];
  createId?: () => string;
}): FolderTemplatePlan {
  const createId = input.createId ?? ulid;
  const nodes = orderFolderTemplateNodes(input.template.nodes);
  const ids = new Map(nodes.map((node) => [node.key, createId()]));
  const siblingCounts = new Map<string, number>();
  const rootOrder =
    Math.max(
      -1,
      ...input.existing
        .filter((row) => row.parentId === input.parentId)
        .map((row) => row.sortOrder),
    ) + 1;
  const plan: FolderTemplatePlan = {
    folders: [],
    views: {},
    automaticTags: {},
  };
  for (const node of nodes) {
    const id = ids.get(node.key) as string;
    const isRoot = node.parentKey === null;
    const parentKey = node.parentKey ?? "";
    const order = siblingCounts.get(parentKey) ?? 0;
    siblingCounts.set(parentKey, order + 1);
    plan.folders.push({
      id,
      parentId: isRoot ? input.parentId : (ids.get(parentKey) ?? null),
      name: (isRoot && input.rootName?.trim()) || node.name,
      color: node.color ?? null,
      sortOrder: isRoot ? rootOrder : order,
    });
    if (node.icon || node.view)
      plan.views[id] = {
        ...node.view,
        ...(node.icon ? { icon: node.icon } : {}),
      };
    if (node.automaticTags?.length)
      plan.automaticTags[id] = [...node.automaticTags];
  }
  return plan;
}

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
    });
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
    const root = plan.folders[0];
    if (!root) throw new Error("A template needs exactly one top folder.");
    return { rootId: root.id, count: plan.folders.length, undoId };
  });
}

function templateView(
  view: Prefs["folderViews"][string] | undefined,
): FolderTemplateView | undefined {
  if (!view) return undefined;
  const { layout, sortKey, sortDir, zoom, includeSubfolders } = view;
  return { layout, sortKey, sortDir, zoom, includeSubfolders };
}

/** Copies a folder's structure and transferable settings; Save memberships, pins, manual order, and covers stay behind. */
export function buildFolderTemplate(input: {
  folderId: string;
  includeSubfolders: boolean;
  name: string;
  description?: string;
  folders: readonly Folder[];
  views: Prefs["folderViews"];
  rules: Prefs["folderRules"];
  createId?: () => string;
}): FolderTemplate {
  const root = input.folders.find((row) => row.id === input.folderId);
  if (!root) throw new Error("Folder no longer exists.");
  const nodes: FolderTemplateNode[] = [];
  const keys = new Map<string, string>();
  const visit = (folder: Folder, parentKey: string | null) => {
    const key = `folder-${nodes.length}`;
    keys.set(folder.id, key);
    const color = FolderColorSchema.safeParse(folder.color);
    const view = input.views[folder.id];
    const tags = input.rules[folder.id]?.automaticTags ?? [];
    nodes.push({
      key,
      parentKey,
      name: folder.name,
      color: color.success ? color.data : null,
      ...(view?.icon ? { icon: view.icon } : {}),
      ...(tags.length ? { automaticTags: [...tags] } : {}),
      ...(view ? { view: templateView(view) } : {}),
    });
    if (!input.includeSubfolders) return;
    const children = input.folders
      .filter((row) => row.parentId === folder.id && !keys.has(row.id))
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
    for (const child of children) visit(child, key);
  };
  visit(root, null);
  return FolderTemplateSchema.parse({
    id: `custom:${(input.createId ?? ulid)()}`,
    name: input.name,
    description: input.description?.trim() || undefined,
    nodes,
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
    });
    await setPrefs({
      folderTemplates: { custom: [...prefs.folderTemplates.custom, template] },
    });
    return template;
  });
}
