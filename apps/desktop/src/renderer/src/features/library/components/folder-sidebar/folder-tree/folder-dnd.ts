import {
  type Active,
  type Announcements,
  type CollisionDetection,
  closestCenter,
  type Over,
  pointerWithin,
} from "@dnd-kit/core";
import type { SortingStrategy } from "@dnd-kit/sortable";
import type { Folder } from "@pond/schema/db";
import type { RefObject } from "react";
import {
  FOLDER_ROOT_DROP_ID,
  type FolderDropKind,
  folderDropKind,
} from "../folder-drop";
import type { FolderDropState } from "../use-folder-drag-drop";

/** The row under the pointer is the target, so drop zones match what it rests on. Keyboard drags have no pointer. */
export const folderCollisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : closestCenter(args);
};

/** Rows hold still while dragging. Droppable rects ignore transforms, so shifted rows would drift from their drop zones. */
export const staticFolderSorting: SortingStrategy = () => null;

export function dndFolderDropOffset(
  active: Active,
  over: Over,
  pointerY?: number | null,
): number {
  if (pointerY != null) return pointerY - over.rect.top;
  const activeRect =
    active.rect.current.translated ?? active.rect.current.initial;
  return activeRect
    ? activeRect.top + activeRect.height / 2 - over.rect.top
    : over.rect.height / 2;
}

export function dndFolderDropKind(
  active: Active,
  over: Over,
  pointerY?: number | null,
): FolderDropKind {
  return folderDropKind(
    dndFolderDropOffset(active, over, pointerY),
    over.rect.height,
  );
}

function relationFor(kind: FolderDropKind) {
  return kind === "into" ? "inside" : kind === "before" ? "before" : "after";
}

export function folderDndAnnouncements(
  folderRows: Folder[],
  drop: RefObject<FolderDropState | null>,
): Announcements {
  const destination = (target: FolderDropState) => {
    if (target.id === FOLDER_ROOT_DROP_ID) return "to the end of Folders";
    const folder = folderRows.find((item) => item.id === target.id);
    return `${relationFor(target.kind)} ${folder?.name ?? "folder"}`;
  };
  return {
    onDragStart: ({ active }) => {
      const folder = folderRows.find((item) => item.id === active.id);
      return `Picked up ${folder?.name ?? "folder"}.`;
    },
    onDragOver: ({ over }) => {
      if (!over) return "The folder is no longer over a target.";
      if (!drop.current) return "The folder can't move here.";
      return `Move folder ${destination(drop.current)}.`;
    },
    onDragEnd: ({ over }) => {
      if (!over || !drop.current)
        return "The folder was dropped without moving.";
      return `Moved folder ${destination(drop.current)}.`;
    },
    onDragCancel: ({ active }) => {
      const folder = folderRows.find((item) => item.id === active.id);
      return `Moving ${folder?.name ?? "folder"} was canceled.`;
    },
  };
}
