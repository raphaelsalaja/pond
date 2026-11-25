import { describe, expect, it } from "vitest";
import {
  createSortableAnnouncements,
  SIDEBAR_SORTABLE_KEYBOARD_CODES,
  SIDEBAR_SORTABLE_SCREEN_READER_INSTRUCTIONS,
  sortablePositionAnnouncement,
} from "./dnd-kit";

const items = ["inbox", "projects", "trash"];
const labelFor = (id: string | number) => String(id).toUpperCase();

describe("sortable announcements", () => {
  it("preserves ordinary sidebar activation keys while exposing reordering", () => {
    expect(SIDEBAR_SORTABLE_KEYBOARD_CODES).toEqual({
      start: ["F2"],
      cancel: ["Escape"],
      end: ["F2"],
    });
    expect(SIDEBAR_SORTABLE_SCREEN_READER_INSTRUCTIONS.draggable).toContain(
      "press F2",
    );
  });

  it("describes an item's human-readable position", () => {
    expect(sortablePositionAnnouncement("projects", items, labelFor)).toBe(
      "PROJECTS, position 2 of 3.",
    );
  });

  it("describes keyboard cancellation", () => {
    const announcements = createSortableAnnouncements(items, labelFor);
    expect(
      announcements.onDragCancel({
        active: {
          id: "projects",
          data: { current: undefined },
          rect: { current: { initial: null, translated: null } },
        },
        over: null,
      }),
    ).toBe("Moving PROJECTS was canceled.");
  });
});
