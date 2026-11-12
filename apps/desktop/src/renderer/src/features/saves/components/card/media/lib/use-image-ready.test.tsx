import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useImageReady } from "./use-image-ready";

let host: HTMLDivElement;
let root: Root;

function Probe({
  src,
  onReady,
  onBroken,
}: {
  src: string;
  onReady: () => void;
  onBroken: () => void;
}) {
  const ready = useImageReady(src, onReady, onBroken);
  return (
    <img
      ref={ready.ref}
      src={src}
      alt=""
      data-loaded={ready.loaded ? "true" : "false"}
      onLoad={ready.onLoad}
      onError={ready.onError}
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
  onReady: () => void,
  onBroken = vi.fn(),
): Promise<void> {
  await act(async () =>
    root.render(<Probe src={src} onReady={onReady} onBroken={onBroken} />),
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
  vi.restoreAllMocks();
});

describe("useImageReady", () => {
  it("settles a cached failed image through the broken-image handler", async () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(
      true,
    );
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(
      0,
    );
    const onReady = vi.fn();
    const onBroken = vi.fn();

    await render("pond://save/card.png", onReady, onBroken);

    expect(image().dataset.loaded).toBe("false");
    expect(onReady).not.toHaveBeenCalled();
    expect(onBroken).toHaveBeenCalledOnce();
  });

  it("resets for a new source and restores readiness after A to B to A", async () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(
      false,
    );
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(
      100,
    );
    const onReady = vi.fn();
    const onBroken = vi.fn();

    await render("pond://save/a.png", onReady, onBroken);
    expect(image().dataset.loaded).toBe("false");
    await act(async () => image().dispatchEvent(new Event("load")));
    expect(image().dataset.loaded).toBe("true");

    await render("pond://save/b.png", onReady, onBroken);
    expect(image().dataset.loaded).toBe("false");
    await act(async () => image().dispatchEvent(new Event("load")));
    expect(image().dataset.loaded).toBe("true");

    await render("pond://save/a.png", onReady, onBroken);
    expect(image().dataset.loaded).toBe("false");
    await act(async () => image().dispatchEvent(new Event("load")));

    expect(image().dataset.loaded).toBe("true");
    expect(onReady).toHaveBeenCalledTimes(3);
    expect(onBroken).not.toHaveBeenCalled();
  });

  it("does not report a cached failure twice when a later error arrives", async () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(
      true,
    );
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(
      0,
    );
    const onBroken = vi.fn();

    await render("pond://save/card.png", vi.fn(), onBroken);
    await act(async () => image().dispatchEvent(new Event("error")));

    expect(onBroken).toHaveBeenCalledOnce();
  });
});
