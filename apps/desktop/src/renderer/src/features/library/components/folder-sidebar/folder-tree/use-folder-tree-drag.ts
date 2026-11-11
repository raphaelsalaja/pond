import {
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { Folder } from "@pond/schema/db";
import { useEffect, useRef, useState } from "react";
import { SIDEBAR_SORTABLE_KEYBOARD_CODES } from "@/shared/lib/dnd-kit";
import {
  FOLDER_ROOT_DROP_ID,
  type FolderDropRow,
  type FolderDropTarget,
  type FolderNestDwell,
  pickFolderDropZone,
  resolveFolderDropTarget,
} from "../folder-drop";
import type {
  FolderDropState,
  useFolderDragDrop,
} from "../use-folder-drag-drop";
import {
  dndFolderDropKind,
  dndFolderDropOffset,
  folderDndAnnouncements,
} from "./folder-dnd";

type FolderDragEvent = Pick<DragEndEvent, "active" | "activatorEvent" | "over">;

interface UseFolderTreeDragInput {
  drag: ReturnType<typeof useFolderDragDrop>;
  folderRows: Folder[];
  visibleRows: readonly FolderDropRow[];
}

export function useFolderTreeDrag({
  drag,
  folderRows,
  visibleRows,
}: UseFolderTreeDragInput) {
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [movingFolderId, setMovingFolderId] = useState<string | null>(null);
  const [keyboardDrag, setKeyboardDrag] = useState(false);
  const pointerY = useRef<number | null>(null);
  const stopPointer = useRef<(() => void) | null>(null);
  const dwell = useRef<FolderNestDwell | null>(null);
  const armTimer = useRef<number | undefined>(undefined);
  const latest = useRef<FolderDragEvent | null>(null);
  const drop = useRef<FolderDropState | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: SIDEBAR_SORTABLE_KEYBOARD_CODES,
    }),
  );

  useEffect(
    () => () => {
      stopPointer.current?.();
      window.clearTimeout(armTimer.current);
    },
    [],
  );

  /** dnd-kit's drag delta includes scroll, but droppable rects follow scroll already, so read the real pointer. */
  function trackPointer(event: React.PointerEvent<HTMLElement>): void {
    stopPointer.current?.();
    pointerY.current = event.clientY;
    const track = (move: PointerEvent) => {
      pointerY.current = move.clientY;
    };
    const stop = () => {
      window.removeEventListener("pointermove", track, true);
      window.removeEventListener("pointerup", stop, true);
      window.removeEventListener("pointercancel", stop, true);
      stopPointer.current = null;
    };
    window.addEventListener("pointermove", track, true);
    window.addEventListener("pointerup", stop, true);
    window.addEventListener("pointercancel", stop, true);
    stopPointer.current = stop;
  }

  function scheduleArm(armsIn: number | undefined): void {
    window.clearTimeout(armTimer.current);
    if (armsIn === undefined) return;
    armTimer.current = window.setTimeout(() => {
      if (latest.current) preview(latest.current);
    }, armsIn);
  }

  function resolve({
    active,
    activatorEvent,
    over,
  }: FolderDragEvent): FolderDropTarget | null {
    if (!over || over.id === FOLDER_ROOT_DROP_ID) {
      dwell.current = null;
      scheduleArm(undefined);
      return over ? { id: FOLDER_ROOT_DROP_ID, kind: "after" } : null;
    }
    const id = String(over.id);
    if (activatorEvent.type.startsWith("key")) {
      return resolveFolderDropTarget(
        { id, kind: dndFolderDropKind(active, over) },
        visibleRows,
      );
    }
    const zone = pickFolderDropZone({
      id,
      offsetY: dndFolderDropOffset(active, over, pointerY.current),
      height: over.rect.height,
      now: performance.now(),
      dwell: dwell.current,
    });
    dwell.current = zone.dwell;
    scheduleArm(zone.armsIn);
    return resolveFolderDropTarget({ id, kind: zone.kind }, visibleRows);
  }

  function preview(event: FolderDragEvent): void {
    latest.current = event;
    const target = resolve(event);
    if (target) {
      drop.current = drag.previewFolderMove(String(event.active.id), target);
      return;
    }
    drop.current = null;
    drag.clearFolderDrop();
  }

  function reset(): void {
    window.clearTimeout(armTimer.current);
    setActiveFolderId(null);
    setKeyboardDrag(false);
    drag.clearFolderDrop();
    dwell.current = null;
    latest.current = null;
    pointerY.current = null;
  }

  function start({ active, activatorEvent }: DragStartEvent): void {
    drop.current = null;
    setActiveFolderId(String(active.id));
    setKeyboardDrag(activatorEvent.type.startsWith("key"));
  }

  /** Commits the drop the indicator shows, so a release never lands somewhere unannounced. */
  function finish({ active, over }: DragEndEvent): void {
    const target = over ? drop.current : null;
    const id = String(active.id);
    reset();
    drop.current = target;
    if (!target) return;
    setMovingFolderId(id);
    void drag.moveFolder(id, target).finally(() => setMovingFolderId(null));
  }

  function cancel(): void {
    drop.current = null;
    reset();
  }

  return {
    activeFolderId,
    announcements: folderDndAnnouncements(folderRows, drop),
    keyboardDrag,
    movingFolderId,
    sensors,
    trackPointer,
    handlers: {
      onDragStart: start,
      onDragMove: preview,
      onDragOver: preview,
      onDragEnd: finish,
      onDragCancel: cancel,
    },
  };
}
