import { afterEach, describe, expect, it, vi } from "vitest";
import {
  beginLibraryLayoutTransition,
  completeLibraryLayoutTransition,
} from "./library-layout-transition";

function place(
  node: HTMLElement,
  left: number,
  top: number,
  width: number,
  height: number,
): void {
  node.style.left = `${left}px`;
  node.style.top = `${top}px`;
  node.style.width = `${width}px`;
  node.style.height = `${height}px`;
}

function card(id: string): HTMLLIElement {
  const node = document.createElement("li");
  node.dataset.libraryCard = "";
  node.dataset.saveId = id;
  node.style.position = "absolute";
  return node;
}

describe("library layout transition", () => {
  afterEach(() => {
    document.body.replaceChildren();
    vi.restoreAllMocks();
  });

  it("FLIPs only mounted cards that intersected the viewport", () => {
    const root = document.createElement("div");
    root.dataset.slot = "window";
    const viewport = document.createElement("main");
    viewport.dataset.libraryGridViewport = "";
    viewport.style.position = "fixed";
    place(viewport, 0, 0, 500, 500);
    const grid = document.createElement("ul");
    const visible = card("visible");
    const offscreen = card("offscreen");
    place(visible, 20, 30, 100, 120);
    place(offscreen, 20, 700, 100, 120);
    grid.append(visible, offscreen);
    viewport.append(grid);
    root.append(viewport);
    document.body.append(root);
    const visibleAnimate = vi.spyOn(visible, "animate");
    const offscreenAnimate = vi.spyOn(offscreen, "animate");

    beginLibraryLayoutTransition();
    expect(root.hasAttribute("data-layout-transition")).toBe(true);
    place(visible, 70, 80, 200, 240);
    completeLibraryLayoutTransition(grid);

    expect(root.hasAttribute("data-layout-transition")).toBe(false);
    expect(visibleAnimate).toHaveBeenCalledTimes(1);
    expect(offscreenAnimate).not.toHaveBeenCalled();
    expect(visibleAnimate).toHaveBeenCalledWith(
      [
        {
          scale: "0.5 0.5",
          transformOrigin: "top left",
          translate: "-50px -50px",
        },
        {
          scale: "1 1",
          transformOrigin: "top left",
          translate: "0px 0px",
        },
      ],
      expect.objectContaining({ composite: "add", duration: 200 }),
    );
  });
});
