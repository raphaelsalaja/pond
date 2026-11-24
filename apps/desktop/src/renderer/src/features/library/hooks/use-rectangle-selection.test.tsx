import "@/app/effects/save-library-bridge";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  primarySelection,
  resultNavigation,
  selection,
} from "@/features/saves/navigation";
import { useRectangleSelection } from "./use-rectangle-selection";

function Gallery() {
  const marquee = useRectangleSelection();
  return (
    <div style={{ overflowY: "auto" }} data-viewport="">
      <div onPointerDown={marquee.onPointerDown} data-library-grid="">
        <div
          data-save-collection=""
          tabIndex={0}
          role="listbox"
          aria-label="Test Saves"
        >
          Saves
        </div>
        {marquee.rectangle ? <output>Selection rectangle</output> : null}
      </div>
    </div>
  );
}

async function pointer(
  target: EventTarget,
  type: string,
  x: number,
  y: number,
  ctrlKey = false,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
    ctrlKey,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  await act(async () => {
    target.dispatchEvent(event);
  });
}

describe("rectangle selection cancellation", () => {
  let host: HTMLDivElement;
  let root: Root;
  let cleanupLayout: () => void;
  function element(selector: string) {
    const node = host.querySelector<HTMLElement>(selector);
    if (!node) {
      throw new Error(`Missing ${selector}`);
    }
    return node;
  }
  beforeEach(async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<Gallery />);
    });
    for (const selector of ["[data-save-collection]", "[data-viewport]"]) {
      Object.defineProperty(element(selector), "getBoundingClientRect", {
        value: () => new DOMRect(0, 0, 300, 300),
      });
    }
    resultNavigation.setSource({ key: "marquee", ids: ["A", "B", "C"] });
    cleanupLayout = resultNavigation.setLayout([
      { id: "A", left: 0, top: 0, width: 80, height: 80 },
      { id: "B", left: 100, top: 0, width: 80, height: 80 },
      { id: "C", left: 200, top: 100, width: 80, height: 80 },
    ]);
    selection.set(["C"]);
    selection.setAnchor("C");
    selection.setCursor("C");
    primarySelection.set("C");
  });
  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    cleanupLayout();
    resultNavigation.setSource({ key: "empty", ids: [] });
    selection.clear();
    primarySelection.set(null);
  });
  it.each(["Escape", "pointercancel", "blur"])(
    "restores the original selection and cursor on %s",
    async (cancel) => {
      await pointer(element("[data-save-collection]"), "pointerdown", 2, 2);
      await pointer(window, "pointermove", 170, 70);
      expect(selection.snapshot()).toEqual(["A", "B"]);
      expect(host.querySelector("output")).not.toBeNull();
      await act(() =>
        window.dispatchEvent(
          cancel === "Escape"
            ? new KeyboardEvent("keydown", {
                key: "Escape",
                bubbles: true,
                cancelable: true,
              })
            : new Event(cancel),
        ),
      );
      expect(selection.snapshot()).toEqual(["C"]);
      expect(selection.getAnchor()).toBe("C");
      expect(selection.getCursor()).toBe("C");
      expect(primarySelection.get()).toBe("C");
      expect(host.querySelector("output")).toBeNull();
      await pointer(window, "pointermove", 30, 30);
      expect(selection.snapshot()).toEqual(["C"]);
    },
  );
  it("adds rectangle hits to the prior selection with a modifier", async () => {
    await pointer(element("[data-save-collection]"), "pointerdown", 2, 2, true);
    await pointer(window, "pointermove", 170, 70, true);
    await pointer(window, "pointerup", 170, 70, true);
    expect(selection.snapshot()).toEqual(["C", "A", "B"]);
    expect(selection.getCursor()).toBe("B");
    expect(host.querySelector("output")).toBeNull();
  });
});
