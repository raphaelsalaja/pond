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
import {
  edgeScrollStep,
  useRectangleSelection,
} from "./use-rectangle-selection";

function Gallery() {
  const marquee = useRectangleSelection();
  return (
    <div style={{ overflowY: "auto" }} data-library-grid-viewport="">
      <div data-library-grid="">
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
    if (!node) throw new Error(`Missing ${selector}`);
    return node;
  }
  beforeEach(async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<Gallery />);
    });
    Object.defineProperty(
      element("[data-save-collection]"),
      "getBoundingClientRect",
      {
        value: () => new DOMRect(24, 0, 252, 160),
      },
    );
    Object.defineProperty(
      element("[data-library-grid-viewport]"),
      "getBoundingClientRect",
      {
        value: () => new DOMRect(0, 0, 300, 300),
      },
    );
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
      await pointer(element("[data-save-collection]"), "pointerdown", 26, 2);
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
    await pointer(
      element("[data-library-grid-viewport]"),
      "pointerdown",
      2,
      2,
      true,
    );
    await pointer(window, "pointermove", 170, 70, true);
    await pointer(window, "pointerup", 170, 70, true);
    expect(selection.snapshot()).toEqual(["C", "A", "B"]);
    expect(selection.getCursor()).toBe("B");
    expect(host.querySelector("output")).toBeNull();
  });

  it("starts from the viewport margin and clears a non-additive selection", async () => {
    await pointer(element("[data-library-grid-viewport]"), "pointerdown", 2, 2);
    expect(selection.snapshot()).toEqual([]);
    expect(primarySelection.get()).toBeNull();
    await pointer(window, "pointermove", 170, 70);
    expect(host.querySelector("output")).not.toBeNull();
    expect(selection.snapshot()).toEqual(["A", "B"]);
    await pointer(window, "pointerup", 170, 70);
  });

  it("starts below the collection content", async () => {
    await pointer(
      element("[data-library-grid-viewport]"),
      "pointerdown",
      30,
      200,
    );
    await pointer(window, "pointermove", 170, 70);
    expect(host.querySelector("output")).not.toBeNull();
    expect(selection.snapshot()).toEqual(["A", "B"]);
    await pointer(window, "pointerup", 170, 70);
  });
});

describe("edge scroll step", () => {
  const viewport = { top: 100, bottom: 400 };
  function step(pointerY: number, elapsedMs = 1000) {
    return edgeScrollStep({ pointerY, viewport, elapsedMs });
  }
  it("accelerates as the pointer moves farther into the edge zone", () => {
    expect(Math.abs(step(120))).toBeGreaterThan(Math.abs(step(130)));
    expect(Math.abs(step(380))).toBeGreaterThan(Math.abs(step(370)));
  });
  it("accelerates farther when the pointer passes the viewport edge", () => {
    expect(Math.abs(step(80))).toBeGreaterThan(Math.abs(step(100)));
    expect(Math.abs(step(420))).toBeGreaterThan(Math.abs(step(400)));
  });
  it("scales with elapsed frame time", () => {
    expect(Math.abs(step(100, 40))).toBeCloseTo(Math.abs(step(100, 20)) * 2);
  });
  it("does not scroll away from the edge zone", () => {
    expect(step(250)).toBe(0);
  });
});
