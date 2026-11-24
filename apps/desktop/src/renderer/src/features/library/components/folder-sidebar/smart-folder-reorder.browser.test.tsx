import { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { savedViews } from "@/features/library/state/saved-views";
import { createFolderSidebarHarness, savedView } from "./test-harness";

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
    harness.set({
      savedViews: [
        { ...savedView("Alpha", "smart_folder"), sortOrder: 0 },
        { ...savedView("Beta", "smart_folder"), sortOrder: 1 },
      ],
    });
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
    const [alpha, beta] = rows.map((row) => row.getBoundingClientRect());
    if (!alpha || !beta) {
      throw new Error("Missing smart folder rows");
    }
    await act(async () => {
      harness
        .button("Beta")
        .dispatchEvent(pointer("pointerdown", beta.top + beta.height / 2));
    });
    await act(async () => {
      document.dispatchEvent(pointer("pointermove", beta.top + 10));
    });
    await act(async () => {
      document.dispatchEvent(pointer("pointermove", alpha.top + 4));
    });
    await act(async () => {
      document.dispatchEvent(pointer("pointerup", alpha.top + 4));
    });
    expect(window.pond.query).toHaveBeenCalledWith("savedViews.reorder", {
      ids: ["Beta", "Alpha"],
    });
    expect(window.pond.query).not.toHaveBeenCalledWith(
      "savedViews.update",
      expect.anything(),
    );
  });
});
