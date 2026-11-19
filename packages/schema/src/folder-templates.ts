import { z } from "zod";
import {
  FolderColorSchema,
  FolderIconIdSchema,
  FolderPresentationSchema,
} from "./folder-presentation";

export const FOLDER_TEMPLATE_NODE_LIMIT = 200;

/** The folder view settings a template carries; Save-specific ones (pins, manual order, cover, random seed) stay with the Library. */
export const FolderTemplateViewSchema = FolderPresentationSchema.pick({
  layout: true,
  sortKey: true,
  sortDir: true,
  zoom: true,
  includeSubfolders: true,
}).partial();

export const FolderTemplateNodeSchema = z.object({
  key: z.string().min(1).max(64),
  parentKey: z.string().min(1).max(64).nullable(),
  name: z.string().trim().min(1).max(255),
  color: FolderColorSchema.nullable().optional(),
  icon: FolderIconIdSchema.optional(),
  automaticTags: z.array(z.string().trim().min(1)).optional(),
  view: FolderTemplateViewSchema.optional(),
});

export const FolderTemplateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(500).optional(),
  nodes: z
    .array(FolderTemplateNodeSchema)
    .min(1)
    .max(FOLDER_TEMPLATE_NODE_LIMIT),
});

export const FolderTemplatePrefsSchema = z.object({
  /** Templates saved on this computer, shared by every Library. */
  custom: z.array(FolderTemplateSchema).catch([]),
});

export type FolderTemplateNode = z.infer<typeof FolderTemplateNodeSchema>;
export type FolderTemplate = z.infer<typeof FolderTemplateSchema>;
export type FolderTemplateView = z.infer<typeof FolderTemplateViewSchema>;

/**
 * Orders a template's nodes parents first, or throws when it has duplicate keys,
 * anything other than one root, a missing parent, or a cycle.
 */
export function orderFolderTemplateNodes(
  nodes: readonly FolderTemplateNode[],
): FolderTemplateNode[] {
  const keys = new Set(nodes.map((node) => node.key));
  if (keys.size !== nodes.length)
    throw new Error("This template has two folders with the same key.");
  const roots = nodes.filter((node) => node.parentKey === null);
  if (roots.length !== 1)
    throw new Error("A template needs exactly one top folder.");
  const children = new Map<string, FolderTemplateNode[]>();
  for (const node of nodes) {
    if (node.parentKey === null) continue;
    if (!keys.has(node.parentKey))
      throw new Error("This template has a folder with a missing parent.");
    children.set(node.parentKey, [
      ...(children.get(node.parentKey) ?? []),
      node,
    ]);
  }
  const ordered: FolderTemplateNode[] = [];
  const visit = (node: FolderTemplateNode) => {
    ordered.push(node);
    for (const child of children.get(node.key) ?? []) visit(child);
  };
  for (const root of roots) visit(root);
  if (ordered.length !== nodes.length)
    throw new Error("This template's folders form a loop.");
  return ordered;
}
