import type { SavedView } from "@pond/schema/db";
import {
  type FolderDropKind,
  type FolderDropRow,
  planFolderSidebarDrop,
} from "@/features/library/components/folder-sidebar/folder-drop";

export interface SmartFolderDrop {
  id: string;
  kind: FolderDropKind;
}

export function smartFolderRows(
  childrenByParent: ReadonlyMap<string | null, readonly { id: string }[]>,
): FolderDropRow[] {
  const rows: FolderDropRow[] = [];
  for (const [parentId, children] of childrenByParent)
    for (const child of children) rows.push({ id: child.id, parentId });
  return rows;
}

export function smartFolderSortableIds(
  childrenByParent: ReadonlyMap<
    string | null,
    readonly Pick<SavedView, "id" | "kind">[]
  >,
): string[] {
  const ids: string[] = [];
  const visit = (parentId: string | null) => {
    for (const child of childrenByParent.get(parentId) ?? []) {
      ids.push(child.id);
      if (child.kind === "group") visit(child.id);
    }
  };
  visit(null);
  return ids;
}

/** Same-parent before/after only. Dropping into a row is not a reorder. */
export function planSmartFolderReorder(
  draggedId: string,
  targetId: string,
  kind: FolderDropKind,
  rows: readonly FolderDropRow[],
): string[] | null {
  if (kind === "into" || draggedId === targetId) return null;
  const dragged = rows.find((row) => row.id === draggedId);
  const target = rows.find((row) => row.id === targetId);
  if (!dragged || !target || dragged.parentId !== target.parentId) return null;
  const move = planFolderSidebarDrop(draggedId, target, kind, rows);
  if (!move || move.parentId !== dragged.parentId) return null;
  const siblings = rows.filter((row) => row.parentId === dragged.parentId);
  const rest = siblings.filter((row) => row.id !== draggedId);
  const index = move.beforeId
    ? rest.findIndex((row) => row.id === move.beforeId)
    : rest.length;
  if (index < 0) return null;
  const next = [...rest];
  const moved = siblings.find((row) => row.id === draggedId);
  if (!moved) return null;
  next.splice(index, 0, moved);
  if (next.every((row, position) => row.id === siblings[position]?.id))
    return null;
  return next.map((row) => row.id);
}

export function keyboardSiblingReorderKind(
  draggedId: string,
  targetId: string,
  rows: readonly FolderDropRow[],
): Extract<FolderDropKind, "before" | "after"> | null {
  const dragged = rows.find((row) => row.id === draggedId);
  const target = rows.find((row) => row.id === targetId);
  if (!dragged || !target || dragged.parentId !== target.parentId) return null;
  const siblings = rows.filter((row) => row.parentId === dragged.parentId);
  const from = siblings.findIndex((row) => row.id === draggedId);
  const to = siblings.findIndex((row) => row.id === targetId);
  if (from < 0 || to < 0 || from === to) return null;
  return from < to ? "after" : "before";
}
