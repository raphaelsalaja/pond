import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { SaveCards } from ".";

beforeEach(() => {
  vi.stubGlobal("pond", { query: async () => [] });
});
afterAll(() => vi.unstubAllGlobals());

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
  Object.defineProperty(strip, "clientWidth", {
    configurable: true,
    value: 100,
  });
  Object.defineProperty(strip, "scrollWidth", {
    configurable: true,
    value: 300,
  });
  Object.defineProperty(strip, "scrollLeft", {
    configurable: true,
    writable: true,
    value: 0,
  });
  const scrollTo = vi.fn((options: ScrollToOptions) => {
    strip.scrollLeft = Math.max(0, Math.min(200, options.left ?? 0));
  });
  Object.defineProperty(strip, "scrollTo", {
    configurable: true,
    value: scrollTo,
  });
  return { strip, scrollTo };
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
  const { strip, scrollTo } = await renderStrip();

  const down = wheel(strip, { deltaY: 60 });
  expect(down.defaultPrevented).toBe(true);
  expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
    left: 60,
    behavior: "instant",
  });

  const up = wheel(strip, { deltaY: -30 });
  expect(up.defaultPrevented).toBe(true);
  expect(scrollTo).toHaveBeenLastCalledWith({
    left: 30,
    behavior: "instant",
  });
});

it("hands the wheel back to the conversation at either end", async () => {
  const { strip, scrollTo } = await renderStrip();

  const atEnd = wheel(strip, { deltaY: 60 });
  expect(atEnd.defaultPrevented).toBe(true);
  strip.scrollLeft = 200;
  const pastEnd = wheel(strip, { deltaY: 60 });
  expect(pastEnd.defaultPrevented).toBe(false);
  expect(scrollTo).toHaveBeenCalledTimes(1);

  strip.scrollLeft = 0;
  const beforeStart = wheel(strip, { deltaY: -60 });
  expect(beforeStart.defaultPrevented).toBe(false);
  expect(scrollTo).toHaveBeenCalledTimes(1);
});

it("leaves horizontal wheel gestures to the browser", async () => {
  const { strip, scrollTo } = await renderStrip();

  const horizontal = wheel(strip, { deltaX: 80 });
  expect(horizontal.defaultPrevented).toBe(false);
  expect(scrollTo).not.toHaveBeenCalled();
});

it("scales line-based wheel steps into pixels", async () => {
  const { strip, scrollTo } = await renderStrip();

  const event = wheel(strip, { deltaY: 3, deltaMode: 1 });
  expect(event.defaultPrevented).toBe(true);
  expect(scrollTo).toHaveBeenCalledExactlyOnceWith({
    left: 48,
    behavior: "instant",
  });
});
