import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Thread } from "../thread";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const marks = [
  { id: "u1", title: "Find my posters", description: "Found 3." },
  { id: "u2", title: "Tag them" },
];

function render(list = marks) {
  act(() => {
    root.render(
      <Thread.Conversation composer={null} marks={list}>
        <p data-thread-mark="u1">Find my posters</p>
        <p data-thread-mark="u2">Tag them</p>
      </Thread.Conversation>,
    );
  });
}

it("draws one tick per turn and jumps to the turn you pick", () => {
  render();
  const ticks = host.querySelectorAll<HTMLButtonElement>(
    'nav[aria-label="Conversation Timeline"] button',
  );
  expect([...ticks].map((tick) => tick.getAttribute("aria-label"))).toEqual([
    "Find my posters",
    "Tag them",
  ]);

  const viewport = host
    .querySelector<HTMLElement>("[data-thread-mark]")
    ?.closest<HTMLElement>('[data-scroll-fade="vertical"]');
  if (!viewport) {
    throw new Error("No viewport");
  }
  const scrollTo = vi.fn();
  viewport.scrollTo = scrollTo;
  act(() => ticks[1]?.click());
  expect(scrollTo).toHaveBeenCalledOnce();
});

it("skips the rail for a single turn", () => {
  render(marks.slice(0, 1));
  expect(host.querySelector("nav")).toBeNull();
});
