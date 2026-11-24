/** @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type {
  DetailsDraft,
  LibraryTargets,
  OverlayResult,
} from "@/utils/messaging";
import { Details } from ".";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const OPEN_TIMEOUT = 15_000;
vi.setConfig({ testTimeout: OPEN_TIMEOUT * 2 });

const library: LibraryTargets = {
  name: "Pond",
  folders: [],
  tags: [
    { name: "Logos", starred: true, usageCount: 4, lastUsedAt: 2 },
    { name: "Posters", starred: false, usageCount: 1, lastUsedAt: null },
  ],
  fish: [],
  recentFolderIds: [],
  recentTags: ["Logos"],
};

const draft: DetailsDraft = {
  kind: "page",
  items: [{ kind: "url", url: "https://example.com/page" }],
  title: "Example",
  url: "https://example.com/page",
  preview: null,
};

let host: HTMLElement;
let layer: HTMLDivElement;
let root: Root;
const boundingRect = HTMLElement.prototype.getBoundingClientRect;

function getBoundingClientRect() {
  return {
    x: 0,
    y: 0,
    width: 240,
    height: 28,
    top: 0,
    right: 240,
    bottom: 28,
    left: 0,
    toJSON() {},
  };
}

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect;
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  host = document.createElement("pond-overlay");
  const shadow = host.attachShadow({ mode: "open" });
  layer = document.createElement("div");
  layer.style.cssText =
    "position:fixed;inset:0;z-index:2147483647;pointer-events:none";
  shadow.append(layer);
  document.body.append(host);
  root = createRoot(layer);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  HTMLElement.prototype.getBoundingClientRect = boundingRect;
  vi.unstubAllGlobals();
});

function searchRoot(): ParentNode {
  return host.shadowRoot ?? document;
}

function option(label: string): HTMLElement {
  const match = [
    ...searchRoot().querySelectorAll<HTMLElement>('[role="option"]'),
    ...document.querySelectorAll<HTMLElement>('[role="option"]'),
  ].find((item) => item.textContent?.includes(label));
  if (!match) {
    throw new Error(`Missing tag option: ${label}`);
  }
  return match;
}

function press(target: HTMLElement): Promise<void> {
  return act(async () => {
    const pointer = {
      bubbles: true,
      cancelable: true,
      pointerType: "mouse",
      button: 0,
    };
    target.dispatchEvent(new PointerEvent("pointerdown", pointer));
    target.dispatchEvent(new MouseEvent("mousedown", pointer));
    target.dispatchEvent(new PointerEvent("pointerup", pointer));
    target.dispatchEvent(new MouseEvent("mouseup", pointer));
    target.click();
  });
}

function type(input: HTMLInputElement, value: string): Promise<void> {
  return act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set?.call(input, value);
    input.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        cancelable: true,
        data: value,
        inputType: "insertText",
      }),
    );
  });
}

it("lets overlay tags be selected and created from the shadow dialog", async () => {
  const onFinish = vi.fn<(result: OverlayResult | null) => void>();
  await act(async () => {
    root.render(
      <Details
        draft={draft}
        library={library}
        container={layer}
        onFinish={onFinish}
      />,
    );
  });

  const input = searchRoot().querySelector<HTMLInputElement>(
    '[aria-label="Tags"]',
  );
  if (!input) {
    throw new Error("Missing tags field");
  }
  await press(input);
  await type(input, "Lo");
  await vi.waitFor(() => option("Logos"), { timeout: OPEN_TIMEOUT });
  await press(option("Logos"));
  await vi.waitFor(() => {
    expect(searchRoot().querySelector('[aria-label="Logos"]')).not.toBeNull();
  });

  await type(input, "brand");
  await vi.waitFor(() => option("Create “brand”"), { timeout: OPEN_TIMEOUT });
  await press(option("Create “brand”"));
  await vi.waitFor(() => {
    expect(searchRoot().querySelector('[aria-label="brand"]')).not.toBeNull();
  });

  const save = [...layer.querySelectorAll("button")].find(
    (button) => button.textContent === "Save",
  );
  await act(async () => save?.click());
  expect(onFinish).toHaveBeenCalledWith({
    kind: "details",
    draft,
    metadata: {
      title: "Example",
      notes: "",
      rating: 0,
      tags: ["Logos", "brand"],
      folderIds: [],
      fishId: null,
    },
  });
});
