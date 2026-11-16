import { MotionConfig } from "motion/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Thread } from "../thread";

class ResizeObserverStub {
  observe() {}
  disconnect() {}
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const frame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function render(reducedMotion: "always" | "never" = "never") {
  await act(async () => {
    root.render(
      <MotionConfig reducedMotion={reducedMotion}>
        <Thread.Conversation composer={<div>Composer</div>}>
          <p>Response</p>
        </Thread.Conversation>
      </MotionConfig>,
    );
  });
  const viewport = host.querySelector('[data-scroll-fade="vertical"]');
  if (!(viewport instanceof HTMLDivElement))
    throw new Error("Missing conversation viewport");
  Object.defineProperties(viewport, {
    scrollHeight: { configurable: true, value: 600 },
    clientHeight: { configurable: true, value: 200 },
    scrollTop: { configurable: true, value: 399, writable: true },
  });
  return viewport;
}

async function scrollTo(viewport: HTMLElement, top: number) {
  await act(async () => {
    viewport.scrollTop = top;
    viewport.dispatchEvent(new Event("scroll"));
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

const latest = () => host.querySelector('[aria-label="Read Latest Response"]');

it("offers the icon-only latest response control once you scroll up", async () => {
  const viewport = await render();
  await scrollTo(viewport, 399);
  expect(latest()).toBeNull();

  await scrollTo(viewport, 100);
  const button = latest();
  if (!(button instanceof HTMLButtonElement))
    throw new Error("Missing latest response control");
  expect(button.textContent).toBe("");

  await act(async () => button.click());
  expect(latest()).toBeNull();
});

it.each(["always", "never"] as const)(
  "returns to the latest response under the %s reduced-motion policy",
  async (reducedMotion) => {
    const viewport = await render(reducedMotion);
    await scrollTo(viewport, 399);
    await scrollTo(viewport, 100);
    const button = latest();
    if (!(button instanceof HTMLButtonElement))
      throw new Error("Missing latest response control");

    await act(async () => {
      button.click();
      await frame();
    });
    if (reducedMotion === "always") expect(viewport.scrollTop).toBe(399);
    else expect(viewport.scrollTop).toBeLessThan(399);
  },
);
