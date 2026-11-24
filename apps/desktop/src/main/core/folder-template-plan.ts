import type { Folder, NewFolder, Prefs } from "@pond/schema/db";
import { FolderColorSchema } from "@pond/schema/folder-presentation";
import {
  FolderTemplateSchema,
  orderFolderTemplateNodes,
} from "@pond/schema/folder-templates";
import type {
  FolderTemplate,
  FolderTemplateNode,
  FolderTemplateView,
} from "@pond/schema/folder-templates";

type FolderView = Partial<Prefs["folderViews"][string]>;
type TemplateFolder = Pick<
  Folder,
  "id" | "parentId" | "name" | "color" | "sortOrder"
>;

export interface FolderTemplatePlan {
  folders: Array<NewFolder>;
  views: Record<string, FolderView>;
  automaticTags: Record<string, Array<string>>;
}

/** Gives every template folder a fresh ID, so a template never shares folders or Saves with what it was made from. */
export function planFolderTemplate(input: {
  template: FolderTemplate;
  parentId: string | null;
  rootName?: string;
  existing: ReadonlyArray<Pick<Folder, "parentId" | "sortOrder">>;
  createId: () => string;
}): FolderTemplatePlan {
  const nodes = orderFolderTemplateNodes(input.template.nodes);
  const ids = new Map<string, string>();
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
    const id = input.createId();
    ids.set(node.key, id);
    const parentKey = node.parentKey;
    const order = siblingCounts.get(parentKey ?? "") ?? 0;
    siblingCounts.set(parentKey ?? "", order + 1);
    plan.folders.push({
      id,
      parentId:
        parentKey === null ? input.parentId : (ids.get(parentKey) ?? null),
      name: (parentKey === null && input.rootName?.trim()) || node.name,
      color: node.color ?? null,
      sortOrder: parentKey === null ? rootOrder : order,
    });
    if (node.icon || node.view) {
      const view: FolderView = { ...node.view };
      if (node.icon) {
        view.icon = node.icon;
      }
      plan.views[id] = view;
    }
    if (node.automaticTags?.length) {
      plan.automaticTags[id] = [...node.automaticTags];
    }
  }
  return plan;
}

function templateView(view: Prefs["folderViews"][string]): FolderTemplateView {
  const { layout, sortKey, sortDir, zoom, includeSubfolders } = view;
  return { layout, sortKey, sortDir, zoom, includeSubfolders };
}

/** Copies a folder's structure and transferable settings; Save memberships, pins, manual order, and covers stay behind. */
export function buildFolderTemplate(input: {
  folderId: string;
  includeSubfolders: boolean;
  name: string;
  description?: string;
  folders: ReadonlyArray<TemplateFolder>;
  views: Prefs["folderViews"];
  rules: Prefs["folderRules"];
  createId: () => string;
}): FolderTemplate {
  const root = input.folders.find((row) => row.id === input.folderId);
  if (!root) {
    throw new Error("Folder no longer exists.");
  }
  const nodes: Array<FolderTemplateNode> = [];
  const visited = new Set<string>();
  const visit = (folder: TemplateFolder, parentKey: string | null) => {
    const key = `folder-${nodes.length}`;
    visited.add(folder.id);
    const color = FolderColorSchema.safeParse(folder.color);
    const view = input.views[folder.id];
    const tags = input.rules[folder.id]?.automaticTags ?? [];
    const node: FolderTemplateNode = {
      key,
      parentKey,
      name: folder.name,
      color: color.success ? color.data : null,
    };
    if (view?.icon) {
      node.icon = view.icon;
    }
    if (tags.length) {
      node.automaticTags = [...tags];
    }
    if (view) {
      node.view = templateView(view);
    }
    nodes.push(node);
    if (!input.includeSubfolders) {
      return;
    }
    const children = input.folders
      .filter((row) => row.parentId === folder.id && !visited.has(row.id))
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      );
    for (const child of children) {
      visit(child, key);
    }
  };
  visit(root, null);
  return FolderTemplateSchema.parse({
    id: `custom:${input.createId()}`,
    name: input.name,
    description: input.description?.trim() || undefined,
    nodes,
  });
}
