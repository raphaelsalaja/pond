import { isHTMLTag } from "@pond/ui/dom";
import { MotionConfig } from "motion/react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Thread } from "../thread";

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  host = document.createElement("div");
  host.style.height = "200px";
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

const frame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

/** use-stick-to-bottom parks the viewport one pixel above its scroll end. */
const bottom = (viewport: HTMLElement) =>
  viewport.scrollHeight - 1 - viewport.clientHeight;

const latest = () => host.querySelector('[aria-label="Read Latest Response"]');

async function render(reducedMotion: "always" | "never" = "never") {
  await act(async () => {
    root.render(
      <MotionConfig reducedMotion={reducedMotion}>
        <Thread.Conversation composer={<div>Composer</div>}>
          <p style={{ height: "600px" }}>Response</p>
        </Thread.Conversation>
      </MotionConfig>,
    );
  });
  const viewport = host.querySelector('[data-scroll-fade="vertical"]');
  if (!isHTMLTag(viewport, "div")) {
    throw new Error("Missing conversation viewport");
  }
  await vi.waitFor(() => {
    expect(viewport.scrollTop).toBe(bottom(viewport));
  });
  return viewport;
}

async function scrollUp(viewport: HTMLElement) {
  /** The view may still be settling onto the bottom on a slow runner, so keep scrolling up like a reader would. */
  await vi.waitFor(() => {
    viewport.scrollTop = 100;
    expect(latest()).not.toBeNull();
  });
  const button = latest();
  if (!isHTMLTag(button, "button")) {
    throw new Error("Missing latest response control");
  }
  return button;
}

it("offers the icon-only latest response control once you scroll up", async () => {
  const viewport = await render();
  expect(latest()).toBeNull();

  const button = await scrollUp(viewport);
  expect(button.textContent).toBe("");

  await act(async () => button.click());
  expect(latest()).toBeNull();
});

it("jumps to the latest response under the always reduced-motion policy", async () => {
  const viewport = await render("always");
  const button = await scrollUp(viewport);

  await act(async () => {
    button.click();
    await frame();
  });
  expect(viewport.scrollTop).toBe(bottom(viewport));
});

it("glides toward the latest response under the never reduced-motion policy", async () => {
  const viewport = await render("never");
  const button = await scrollUp(viewport);

  await act(async () => {
    button.click();
    await frame();
  });
  expect(viewport.scrollTop).toBeLessThan(bottom(viewport));
});
