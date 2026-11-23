import {
  type FolderTemplateNode,
  orderFolderTemplateNodes,
} from "@pond/schema/folder-templates";

export interface FolderTemplateRow {
  node: FolderTemplateNode;
  depth: number;
}

/** Template folders in display order with their nesting depth, or none when the template is invalid. */
export function folderTemplateRows(
  nodes: readonly FolderTemplateNode[],
): FolderTemplateRow[] {
  let ordered: FolderTemplateNode[];
  try {
    ordered = orderFolderTemplateNodes(nodes);
  } catch {
    return [];
  }
  const depths = new Map<string, number>();
  return ordered.map((node) => {
    const depth =
      node.parentKey === null ? 0 : (depths.get(node.parentKey) ?? 0) + 1;
    depths.set(node.key, depth);
    return { node, depth };
  });
}
