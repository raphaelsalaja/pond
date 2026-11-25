import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useImageReady } from "./use-image-ready";
import type { ImageDecodeState } from "./use-image-ready";

let host: HTMLDivElement;
let root: Root;

/** jsdom decodes no images, so each test states what the element reports. */
const cachedFailure = (): ImageDecodeState => ({
  complete: true,
  naturalWidth: 0,
});
const decodedOnLoad = (): ImageDecodeState => ({
  complete: false,
  naturalWidth: 100,
});

function Probe({
  src,
  onReady,
  onBroken,
  readState,
}: {
  src: string;
  onReady: () => void;
  onBroken: () => void;
  readState: () => ImageDecodeState;
}) {
  const {
    ref: imageRef,
    loaded,
    onLoad,
    onError,
  } = useImageReady(src, onReady, onBroken, readState);
  return (
    <img
      ref={imageRef}
      src={src}
      alt=""
      data-loaded={loaded ? "true" : "false"}
      onLoad={onLoad}
      onError={onError}
    />
  );
}

function image(): HTMLImageElement {
  const image = host.querySelector("img");
  if (!image) throw new Error("expected image");
  return image;
}

async function render(
  src: string,
  readState: () => ImageDecodeState,
  onReady: () => void,
  onBroken = vi.fn(),
): Promise<void> {
  await act(async () =>
    root.render(
      <Probe
        src={src}
        onReady={onReady}
        onBroken={onBroken}
        readState={readState}
      />,
    ),
  );
}

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("useImageReady", () => {
  it("settles a cached failed image through the broken-image handler", async () => {
    const onReady = vi.fn();
    const onBroken = vi.fn();

    await render("pond://save/card.png", cachedFailure, onReady, onBroken);

    expect(image().dataset.loaded).toBe("false");
    expect(onReady).not.toHaveBeenCalled();
    expect(onBroken).toHaveBeenCalledOnce();
  });

  it("resets for a new source and restores readiness after A to B to A", async () => {
    const onReady = vi.fn();
    const onBroken = vi.fn();

    await render("pond://save/a.png", decodedOnLoad, onReady, onBroken);
    expect(image().dataset.loaded).toBe("false");
    await act(async () => image().dispatchEvent(new Event("load")));
    expect(image().dataset.loaded).toBe("true");

    await render("pond://save/b.png", decodedOnLoad, onReady, onBroken);
    expect(image().dataset.loaded).toBe("false");
    await act(async () => image().dispatchEvent(new Event("load")));
    expect(image().dataset.loaded).toBe("true");

    await render("pond://save/a.png", decodedOnLoad, onReady, onBroken);
    expect(image().dataset.loaded).toBe("false");
    await act(async () => image().dispatchEvent(new Event("load")));

    expect(image().dataset.loaded).toBe("true");
    expect(onReady).toHaveBeenCalledTimes(3);
    expect(onBroken).not.toHaveBeenCalled();
  });

  it("does not report a cached failure twice when a later error arrives", async () => {
    const onBroken = vi.fn();

    await render("pond://save/card.png", cachedFailure, vi.fn(), onBroken);
    await act(async () => image().dispatchEvent(new Event("error")));

    expect(onBroken).toHaveBeenCalledOnce();
  });
});
