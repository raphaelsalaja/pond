import type {
  Announcements,
  DropAnimation,
  KeyboardCodes,
  ScreenReaderInstructions,
  UniqueIdentifier,
} from "@dnd-kit/core";

export const SORTABLE_DROP_ANIMATION: DropAnimation = {
  duration: 150,
  easing: "cubic-bezier(0.22, 1, 0.36, 1)",
};

export const SIDEBAR_SORTABLE_KEYBOARD_CODES: KeyboardCodes = {
  start: ["F2"],
  cancel: ["Escape"],
  end: ["F2"],
};

export const SIDEBAR_SORTABLE_SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions =
  {
    draggable:
      "To move this sidebar item, press F2. While sorting, use the arrow keys to move it. Press F2 again to drop it, or Escape to cancel.",
  };

export function sortablePositionAnnouncement(
  id: UniqueIdentifier,
  items: ReadonlyArray<UniqueIdentifier>,
  labelFor: (id: UniqueIdentifier) => string,
): string {
  const position = items.indexOf(id) + 1;
  const label = labelFor(id);
  return position > 0
    ? `${label}, position ${position} of ${items.length}.`
    : label;
}

export function createSortableAnnouncements(
  items: ReadonlyArray<UniqueIdentifier>,
  labelFor: (id: UniqueIdentifier) => string,
): Announcements {
  return {
    onDragStart({ active }) {
      return `Picked up ${sortablePositionAnnouncement(active.id, items, labelFor)}`;
    },
    onDragOver({ active, over }) {
      if (!over) {
        return `${labelFor(active.id)} is no longer over a drop target.`;
      }
      return `${labelFor(active.id)} is over ${sortablePositionAnnouncement(over.id, items, labelFor)}`;
    },
    onDragEnd({ active, over }) {
      if (!over) return `${labelFor(active.id)} was dropped without moving.`;
      return `Dropped ${labelFor(active.id)} at ${sortablePositionAnnouncement(over.id, items, labelFor)}`;
    },
    onDragCancel({ active }) {
      return `Moving ${labelFor(active.id)} was canceled.`;
    },
  };
}
