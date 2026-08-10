// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MediaUnit } from "@/lib/media/units";
import type { Save } from "@/lib/types";
import { HoverGallery } from ".";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("HoverGallery preview scheduling", () => {
  it("requests the resting slide eagerly and keeps hover-only slides lazy", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    const save = {
      id: "gallery",
      files: [
        { path: "first.jpg", width: 800, height: 600 },
        { path: "second.jpg", width: 800, height: 600 },
      ],
    } as Save;
    const slides: MediaUnit[] = [
      { key: "first.jpg", url: "pond://gallery/first.jpg", isVideo: false },
      { key: "second.jpg", url: "pond://gallery/second.jpg", isVideo: false },
    ];
    const onReady = vi.fn();

    act(() => {
      root?.render(
        <HoverGallery
          save={save}
          slides={slides}
          active={0}
          seen={new Set([0, 1])}
          onBroken={vi.fn()}
          onReady={onReady}
        />,
      );
    });

    const images = container.querySelectorAll("img");
    expect(images).toHaveLength(2);
    expect(images[0]?.getAttribute("loading")).toBe("eager");
    expect(images[0]?.getAttribute("fetchpriority")).toBe("auto");
    expect(images[0]?.getAttribute("data-loaded")).toBe("false");
    expect(images[1]?.getAttribute("loading")).toBe("lazy");
    expect(images[1]?.getAttribute("fetchpriority")).toBe("low");

    for (const image of images) {
      Object.defineProperties(image, {
        naturalWidth: { configurable: true, value: 800 },
        naturalHeight: { configurable: true, value: 600 },
      });
    }
    act(() => images[1]?.dispatchEvent(new Event("load")));
    expect(onReady).not.toHaveBeenCalled();
    act(() => images[0]?.dispatchEvent(new Event("load")));
    expect(onReady).toHaveBeenCalledTimes(1);
    expect(images[0]?.getAttribute("data-loaded")).toBe("true");
  });
});
