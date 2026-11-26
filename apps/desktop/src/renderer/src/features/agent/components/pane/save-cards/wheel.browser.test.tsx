/// <reference types="@vitest/browser-playwright" />
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SaveCards } from ".";

const sources = [
  { id: "one", title: "One", url: "https://example.com/one", source: "web" },
  { id: "two", title: "Two", url: "https://example.com/two", source: "web" },
  {
    id: "three",
    title: "Three",
    url: "https://example.com/three",
    source: "web",
  },
];

const host = document.createElement("div");
host.style.width = "120px";
document.body.append(host);
let root = createRoot(host);
afterEach(async () => {
  await act(async () => root.unmount());
  root = createRoot(host);
});

async function renderStrip() {
  await act(async () =>
    root.render(
      <SaveCards sources={sources} onOpenSave={vi.fn()} onAttach={vi.fn()} />,
    ),
  );
  const strip = host.querySelector<HTMLElement>(
    'section[aria-label="Consulted Saves"]',
  );
  if (!strip) throw new Error("Missing save strip");
  const max = strip.scrollWidth - strip.clientWidth;
  expect(max).toBeGreaterThan(60);
  return { strip, max };
}

function wheel(strip: HTMLElement, options: WheelEventInit) {
  const event = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    ...options,
  });
  strip.dispatchEvent(event);
  return event;
}

it("feeds a vertical wheel to the strip until it reaches an end", async () => {
  const { strip } = await renderStrip();

  const down = wheel(strip, { deltaY: 60 });
  expect(down.defaultPrevented).toBe(true);
  expect(strip.scrollLeft).toBe(60);

  const up = wheel(strip, { deltaY: -30 });
  expect(up.defaultPrevented).toBe(true);
  expect(strip.scrollLeft).toBe(30);
});

it("hands the wheel back to the conversation at either end", async () => {
  const { strip, max } = await renderStrip();

  strip.scrollLeft = max;
  const pastEnd = wheel(strip, { deltaY: 60 });
  expect(pastEnd.defaultPrevented).toBe(false);
  expect(strip.scrollLeft).toBe(max);

  strip.scrollLeft = 0;
  const beforeStart = wheel(strip, { deltaY: -60 });
  expect(beforeStart.defaultPrevented).toBe(false);
  expect(strip.scrollLeft).toBe(0);
});

it("leaves horizontal wheel gestures to the browser", async () => {
  const { strip } = await renderStrip();

  const horizontal = wheel(strip, { deltaX: 80 });
  expect(horizontal.defaultPrevented).toBe(false);
  expect(strip.scrollLeft).toBe(0);
});

it("scales line-based wheel steps into pixels", async () => {
  const { strip } = await renderStrip();

  const event = wheel(strip, { deltaY: 3, deltaMode: 1 });
  expect(event.defaultPrevented).toBe(true);
  expect(strip.scrollLeft).toBe(48);
});
