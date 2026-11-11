import { descendantFolderIds } from "./tree";

export const FOLDER_DRAG_TYPE = "application/x-pond-folder";

/** Droppable under the last folder row; a drop there places the folder last at the top level. */
export const FOLDER_ROOT_DROP_ID = "folder-root";

/** Centered share of a row that nests. The outer bands place before or after. */
const FOLDER_NEST_BAND = 0.3;

/** Rest in the nest band this long before nesting arms, so sweeping across rows never nests. */
export const FOLDER_NEST_DWELL_MS = 300;

export type FolderDropKind = "before" | "into" | "after";

export interface FolderDropRow {
  id: string;
  parentId: string | null;
}

export interface FolderDropMove {
  id: string;
  parentId: string | null;
  beforeId?: string;
}

export interface FolderDropTarget {
  id: string;
  kind: FolderDropKind;
}

export interface FolderNestDwell {
  id: string;
  since: number;
}

interface FolderDropZoneInput {
  id: string;
  offsetY: number;
  height: number;
  now: number;
  dwell: FolderNestDwell | null;
}

interface FolderDropZone {
  kind: FolderDropKind;
  dwell: FolderNestDwell | null;
  armsIn?: number;
}

export function isFolderDrag(types: Iterable<string>): boolean {
  for (const type of types) {
    if (type.toLowerCase() === FOLDER_DRAG_TYPE) return true;
  }
  return false;
}

export function folderDropKind(
  offsetY: number,
  height: number,
): FolderDropKind {
  if (height <= 0) return "into";
  const ratio = offsetY / height;
  if (ratio < (1 - FOLDER_NEST_BAND) / 2) return "before";
  if (ratio > (1 + FOLDER_NEST_BAND) / 2) return "after";
  return "into";
}

/** Until the dwell arms, the nest band splits at the row's midline into before and after. */
export function pickFolderDropZone({
  id,
  offsetY,
  height,
  now,
  dwell,
}: FolderDropZoneInput): FolderDropZone {
  const kind = folderDropKind(offsetY, height);
  if (kind !== "into") return { kind, dwell: null };
  const resting = dwell?.id === id ? dwell : { id, since: now };
  const waited = now - resting.since;
  if (waited >= FOLDER_NEST_DWELL_MS) return { kind, dwell: resting };
  return {
    kind: offsetY < height / 2 ? "before" : "after",
    dwell: resting,
    armsIn: FOLDER_NEST_DWELL_MS - waited,
  };
}

/** The line after an expanded folder sits above its first child, so the drop lands there. */
export function resolveFolderDropTarget(
  drop: FolderDropTarget,
  visibleRows: readonly FolderDropRow[],
): FolderDropTarget {
  if (drop.kind !== "after") return drop;
  const at = visibleRows.findIndex((row) => row.id === drop.id);
  const next = at >= 0 ? visibleRows[at + 1] : undefined;
  return next?.parentId === drop.id ? { id: next.id, kind: "before" } : drop;
}

export function planFolderSidebarDrop(
  draggedId: string,
  target: FolderDropRow,
  kind: FolderDropKind,
  folders: readonly FolderDropRow[],
): FolderDropMove | null {
  if (draggedId === target.id) return null;
  const inside = new Set(descendantFolderIds(draggedId, folders));
  if (kind === "into") {
    if (inside.has(target.id)) return null;
    return { id: draggedId, parentId: target.id };
  }
  if (
    target.parentId === draggedId ||
    (target.parentId !== null && inside.has(target.parentId))
  ) {
    return null;
  }
  if (kind === "before") {
    return {
      id: draggedId,
      parentId: target.parentId,
      beforeId: target.id,
    };
  }
  const siblings = folders.filter((row) => row.parentId === target.parentId);
  const at = siblings.findIndex((row) => row.id === target.id);
  const next = at >= 0 ? siblings[at + 1] : undefined;
  if (next?.id === draggedId) return null;
  return next
    ? { id: draggedId, parentId: target.parentId, beforeId: next.id }
    : { id: draggedId, parentId: target.parentId };
}

export function planFolderDrop(
  draggedId: string,
  drop: FolderDropTarget,
  folders: readonly FolderDropRow[],
): FolderDropMove | null {
  if (drop.id === FOLDER_ROOT_DROP_ID) {
    const roots = folders.filter((row) => row.parentId === null);
    return roots.at(-1)?.id === draggedId
      ? null
      : { id: draggedId, parentId: null };
  }
  const target = folders.find((row) => row.id === drop.id);
  return target
    ? planFolderSidebarDrop(draggedId, target, drop.kind, folders)
    : null;
}
