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

const VIEWPORT_HEIGHT = 240;
const CONTENT_HEIGHT = 3000;
const SCROLL_FRAMES = 8;

function Gallery() {
  const marquee = useRectangleSelection();
  return (
    <div
      style={{ height: VIEWPORT_HEIGHT, overflowY: "auto", width: 320 }}
      data-library-grid-viewport=""
    >
      <div data-library-grid="">
        <div
          data-save-collection=""
          tabIndex={0}
          role="listbox"
          aria-label="Test Saves"
          style={{ height: CONTENT_HEIGHT }}
        >
          Saves
        </div>
        {marquee.rectangle ? <output>Selection rectangle</output> : null}
      </div>
    </div>
  );
}

function pointerEvent(type: string, x: number, y: number): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: x,
    clientY: y,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  return event;
}

function frame(): Promise<number> {
  return new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });
}

function element(host: HTMLElement, selector: string): HTMLElement {
  const node = host.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`Missing ${selector}`);
  return node;
}

describe("rectangle selection edge scrolling", () => {
  let host: HTMLDivElement;
  let root: Root;
  let motionStyles: HTMLStyleElement;

  beforeEach(async () => {
    motionStyles = document.createElement("style");
    motionStyles.textContent = "* { scroll-behavior: smooth; }";
    document.head.append(motionStyles);
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    resultNavigation.setSource({ key: "marquee", ids: [] });
    await act(async () => {
      root.render(<Gallery />);
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    motionStyles.remove();
    resultNavigation.setSource({ key: "empty", ids: [] });
    selection.clear();
    primarySelection.set(null);
  });

  it("keeps the intended edge-scroll speed when smooth scrolling is preferred", async () => {
    const viewport = element(host, "[data-library-grid-viewport]");
    const collection = element(host, "[data-save-collection]");
    expect(getComputedStyle(viewport).scrollBehavior).toBe("smooth");
    const bounds = viewport.getBoundingClientRect();
    const x = bounds.left + 20;
    const startY = bounds.top + 12;
    const edgeY = bounds.bottom + 56;
    const started = performance.now();

    await act(async () => {
      collection.dispatchEvent(pointerEvent("pointerdown", x, startY));
      window.dispatchEvent(pointerEvent("pointermove", x, edgeY));
    });

    let previous = started;
    let expected = 0;
    for (let index = 0; index < SCROLL_FRAMES; index += 1) {
      let now = previous;
      await act(async () => {
        now = await frame();
      });
      expected += edgeScrollStep({
        pointerY: edgeY,
        viewport: bounds,
        elapsedMs: now - previous,
      });
      previous = now;
    }

    const actual = viewport.scrollTop;
    await act(async () => {
      window.dispatchEvent(pointerEvent("pointerup", x, edgeY));
    });
    expect(actual).toBeGreaterThan(expected * 0.8);
  });
});
