import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { savedViews } from "@/features/library/state/saved-views";
import {
  createFolderSidebarHarness,
  pondQuery,
  savedView,
  savedViewList,
} from "./test-harness";

function pointer(type: string, clientY: number): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    button: 0,
    cancelable: true,
    clientX: 20,
    clientY,
  });
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: 1 },
    pointerType: { value: "mouse" },
  });
  return event;
}

describe("smart folder reordering", () => {
  const harness = createFolderSidebarHarness();

  beforeEach(() => harness.setup());
  afterEach(() => harness.cleanup());

  it("reorders a smart folder before its sibling and keeps the parent", async () => {
    savedViewList.current = [
      { ...savedView("Alpha", "smart_folder"), sortOrder: 0 },
      { ...savedView("Beta", "smart_folder"), sortOrder: 1 },
    ];
    await savedViews.refresh();
    await harness.mount();
    const rows = [
      ...harness.host.querySelectorAll<HTMLElement>(
        "[data-smart-folder-sortable]",
      ),
    ];
    expect(rows.map((row) => row.dataset.smartFolderSortable)).toEqual([
      "Alpha",
      "Beta",
    ]);
    rows.forEach((row, index) => {
      vi.spyOn(row, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ x: 0, y: index * 40, width: 220, height: 40 }),
      );
    });
    await act(async () => {
      harness.button("Beta").dispatchEvent(pointer("pointerdown", 60));
    });
    await act(async () => {
      document.dispatchEvent(pointer("pointermove", 50));
    });
    await act(async () => {
      document.dispatchEvent(pointer("pointermove", 4));
    });
    await act(async () => {
      document.dispatchEvent(pointer("pointerup", 4));
    });
    expect(pondQuery).toHaveBeenCalledWith("savedViews.reorder", {
      ids: ["Beta", "Alpha"],
    });
    expect(pondQuery).not.toHaveBeenCalledWith(
      "savedViews.update",
      expect.anything(),
    );
  });
});
