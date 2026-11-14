import type { Folder } from "@pond/schema/db";
import { useRef, useState } from "react";
import { rememberFolderDestinations } from "@/features/library/lib/recent-folders";
import { folders } from "@/features/library/state/folders";
import {
  announceSaveDragTarget,
  endSaveDrag,
  isLibrarySaveDrag,
  notifyFolderMembershipChange,
  saveDropIds,
} from "@/features/saves";
import { errorCopy } from "@/shared/lib/error-copy";
import { notify } from "@/shared/lib/toast";
import {
  type FolderDropKind,
  type FolderDropTarget,
  planFolderDrop,
} from "./folder-drop";

export interface FolderDropState {
  id: string;
  kind: FolderDropKind;
  saveCount?: number;
}

interface UseFolderDragDropInput {
  folderRows: Folder[];
  selectedIds?: string[];
  revealFolder: (id: string) => void;
}

export function useFolderDragDrop({
  folderRows,
  selectedIds = [],
  revealFolder,
}: UseFolderDragDropInput) {
  const [folderDrop, setFolderDrop] = useState<FolderDropState | null>(null);
  const announcedSaveTargetRef = useRef<string | null>(null);
  const dragDepthRef = useRef(new Map<string, number>());

  async function addSavesToFolder(
    folder: Folder,
    ids: string[],
  ): Promise<void> {
    const count = ids.length;
    try {
      const result = await window.pond.query("folders.addSaves", {
        folderId: folder.id,
        saveIds: ids,
      });
      rememberFolderDestinations([folder.id]);
      await folders.refresh();
      notifyFolderMembershipChange(
        { kind: "add", saveCount: count, folders: [folder] },
        result.ok ? result.undoId : null,
      );
    } catch (error) {
      notify({
        id: "add-saves-to-folder",
        title: `Couldn't add ${count === 1 ? "Save" : "Saves"} to folder`,
        description: errorCopy(error, "Try again."),
      });
    }
  }

  function folderMoveTarget(
    draggedId: string,
    drop: FolderDropTarget,
  ): FolderDropState | null {
    const ids = selectedIds.includes(draggedId) ? selectedIds : [draggedId];
    const allowed =
      !ids.includes(drop.id) &&
      ids.every((id) => planFolderDrop(id, drop, folderRows));
    return allowed ? { id: drop.id, kind: drop.kind } : null;
  }

  function previewFolderMove(
    draggedId: string,
    drop: FolderDropTarget,
  ): FolderDropState | null {
    const target = folderMoveTarget(draggedId, drop);
    setFolderDrop((current) =>
      current?.id === target?.id &&
      current?.kind === target?.kind &&
      current?.saveCount === undefined
        ? current
        : target,
    );
    return target;
  }

  async function moveFolder(
    draggedId: string,
    drop: FolderDropTarget,
  ): Promise<void> {
    if (!folderMoveTarget(draggedId, drop)) return;
    const move = planFolderDrop(draggedId, drop, folderRows);
    if (!move) return;
    try {
      const ids = selectedIds.includes(draggedId) ? selectedIds : [draggedId];
      if (ids.length > 1)
        await window.pond.query("folders.moveBatch", {
          ids,
          parentId: move.parentId,
          beforeId: move.beforeId,
        });
      else await window.pond.query("folders.move", move);
      await folders.refresh();
      if (move.parentId) revealFolder(move.parentId);
    } catch (error) {
      notify({
        id: "move-folder",
        title: "Couldn't move folder",
        description: errorCopy(error, "Try again."),
      });
    }
  }

  function leaveFolder(id: string) {
    dragDepthRef.current.delete(id);
    setFolderDrop((current) => (current?.id === id ? null : current));
    if (announcedSaveTargetRef.current === id)
      announcedSaveTargetRef.current = null;
  }

  /** Native drags report a null `relatedTarget`, so enter and leave are counted per row instead. */
  function handlersFor(folder: Folder) {
    return {
      onDragEnter(event: React.DragEvent<HTMLElement>) {
        if (!isLibrarySaveDrag(event.dataTransfer)) return;
        const depths = dragDepthRef.current;
        depths.set(folder.id, (depths.get(folder.id) ?? 0) + 1);
      },
      onDragOver(event: React.DragEvent<HTMLElement>) {
        if (!isLibrarySaveDrag(event.dataTransfer)) return;
        const ids = saveDropIds(event.dataTransfer);
        if (ids.length === 0) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        if (!dragDepthRef.current.has(folder.id))
          dragDepthRef.current.set(folder.id, 1);
        setFolderDrop((current) =>
          current?.id === folder.id &&
          current.kind === "into" &&
          current.saveCount === ids.length
            ? current
            : { id: folder.id, kind: "into", saveCount: ids.length },
        );
        if (announcedSaveTargetRef.current !== folder.id) {
          announcedSaveTargetRef.current = folder.id;
          announceSaveDragTarget(folder.name, ids.length);
        }
      },
      onDragLeave() {
        const depths = dragDepthRef.current;
        const depth = (depths.get(folder.id) ?? 0) - 1;
        if (depth > 0) depths.set(folder.id, depth);
        else leaveFolder(folder.id);
      },
      onDrop(event: React.DragEvent<HTMLElement>) {
        const ids = saveDropIds(event.dataTransfer);
        if (ids.length === 0) return;
        event.preventDefault();
        dragDepthRef.current.clear();
        setFolderDrop(null);
        announcedSaveTargetRef.current = null;
        endSaveDrag();
        void addSavesToFolder(folder, ids);
      },
    };
  }

  return {
    folderDrop,
    clearFolderDrop: () => {
      dragDepthRef.current.clear();
      setFolderDrop(null);
    },
    folderMoveTarget,
    handlersFor,
    moveFolder,
    previewFolderMove,
  };
}
