import type {
  Announcements,
  DragEndEvent,
  DragMoveEvent,
  DragOverEvent,
  DragStartEvent,
} from "@dnd-kit/core";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { SavedView } from "@pond/schema/db";
import { type RefObject, useRef, useState } from "react";
import { dndFolderDropKind } from "@/features/library/components/folder-sidebar/folder-tree/folder-dnd";
import {
  groupMoveChoices,
  selectedViewRoots,
} from "@/features/library/lib/smart-folders";
import { savedViews } from "@/features/library/state/saved-views";
import { SIDEBAR_SORTABLE_KEYBOARD_CODES } from "@/shared/lib/dnd-kit";
import { runAction } from "./menu-items";
import {
  keyboardSiblingReorderKind,
  planSmartFolderReorder,
  type SmartFolderDrop,
  type smartFolderRows,
} from "./reorder";

interface UseSmartFolderDragInput {
  views: SavedView[];
  rows: ReturnType<typeof smartFolderRows>;
  selectedIds: string[];
  onReveal: (id: string) => void;
}

function relation(kind: SmartFolderDrop["kind"] | null): string {
  if (kind === "before") return "before";
  if (kind === "after") return "after";
  if (kind === "into") return "inside";
  return "over";
}

function smartFolderAnnouncements(
  views: readonly SavedView[],
  rows: UseSmartFolderDragInput["rows"],
  pointerY: RefObject<number | null>,
  keyboard: RefObject<boolean>,
): Announcements {
  const name = (id: string) =>
    views.find((view) => view.id === id)?.name ?? "item";
  const kindFor = (
    activeId: string,
    overId: string,
    active: DragEndEvent["active"],
    over: NonNullable<DragEndEvent["over"]>,
  ) =>
    keyboard.current
      ? keyboardSiblingReorderKind(activeId, overId, rows)
      : dndFolderDropKind(active, over, pointerY.current);
  return {
    onDragStart({ active }) {
      return `Picked up ${name(String(active.id))}.`;
    },
    onDragOver({ active, over }) {
      if (!over)
        return `${name(String(active.id))} is no longer over a target.`;
      const kind = kindFor(String(active.id), String(over.id), active, over);
      return `Move ${name(String(active.id))} ${relation(kind)} ${name(String(over.id))}.`;
    },
    onDragEnd({ active, over }) {
      if (!over)
        return `${name(String(active.id))} was dropped without moving.`;
      const kind = kindFor(String(active.id), String(over.id), active, over);
      return `Moved ${name(String(active.id))} ${relation(kind)} ${name(String(over.id))}.`;
    },
    onDragCancel({ active }) {
      return `Moving ${name(String(active.id))} was canceled.`;
    },
  };
}

export function useSmartFolderDrag({
  views,
  rows,
  selectedIds,
  onReveal,
}: UseSmartFolderDragInput) {
  const [drop, setDrop] = useState<SmartFolderDrop | null>(null);
  const pointerStartY = useRef<number | null>(null);
  const pointerY = useRef<number | null>(null);
  const keyboard = useRef(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: SIDEBAR_SORTABLE_KEYBOARD_CODES,
    }),
  );

  function groupDropAllowed(draggedId: string, target: SavedView): boolean {
    if (target.kind !== "group") return false;
    const ids = selectedIds.includes(draggedId) ? selectedIds : [draggedId];
    const roots = selectedViewRoots(ids, views);
    return (
      roots.length > 0 &&
      roots.every((entry) =>
        groupMoveChoices(entry.id, views).some(
          (group) => group.id === target.id,
        ),
      )
    );
  }

  function reset(): void {
    setDrop(null);
    pointerStartY.current = null;
    pointerY.current = null;
    keyboard.current = false;
  }

  function start({ activatorEvent }: DragStartEvent): void {
    keyboard.current = activatorEvent.type.startsWith("key");
    pointerStartY.current =
      "clientY" in activatorEvent ? Number(activatorEvent.clientY) : null;
    pointerY.current = pointerStartY.current;
  }

  function move({ delta }: DragMoveEvent): void {
    pointerY.current =
      pointerStartY.current == null ? null : pointerStartY.current + delta.y;
  }

  function preview({ active, over }: DragOverEvent): void {
    if (!over) {
      setDrop(null);
      return;
    }
    const target = views.find((view) => view.id === over.id);
    if (!target) {
      setDrop(null);
      return;
    }
    const draggedId = String(active.id);
    if (keyboard.current) {
      const kind = keyboardSiblingReorderKind(draggedId, target.id, rows);
      setDrop(kind ? { id: target.id, kind } : null);
      return;
    }
    const geometric = dndFolderDropKind(active, over, pointerY.current);
    if (geometric === "into") {
      setDrop(
        groupDropAllowed(draggedId, target)
          ? { id: target.id, kind: "into" }
          : null,
      );
      return;
    }
    const ordered = planSmartFolderReorder(
      draggedId,
      target.id,
      geometric,
      rows,
    );
    setDrop(ordered ? { id: target.id, kind: geometric } : null);
  }

  async function finish({ active, over }: DragEndEvent): Promise<void> {
    const keyboardDrag = keyboard.current;
    const pointer = pointerY.current;
    setDrop(null);
    pointerStartY.current = null;
    if (!over) return;
    const target = views.find((view) => view.id === over.id);
    if (!target) return;
    const draggedId = String(active.id);
    const geometric = dndFolderDropKind(active, over, pointer);
    if (!keyboardDrag && geometric === "into") {
      if (!groupDropAllowed(draggedId, target)) return;
      const ids = selectedIds.includes(draggedId) ? selectedIds : [draggedId];
      const roots = selectedViewRoots(ids, views);
      onReveal(target.id);
      await runAction(async () => {
        for (const entry of roots) await savedViews.move(entry.id, target.id);
      });
      return;
    }
    const kind = keyboardDrag
      ? keyboardSiblingReorderKind(draggedId, target.id, rows)
      : geometric;
    if (kind === "into" || !kind) return;
    const ordered = planSmartFolderReorder(draggedId, target.id, kind, rows);
    if (!ordered) return;
    await runAction(() => savedViews.reorder(ordered));
  }

  return {
    announcements: smartFolderAnnouncements(views, rows, pointerY, keyboard),
    cancel: reset,
    drop,
    finish,
    move,
    preview,
    sensors,
    start,
  };
}
