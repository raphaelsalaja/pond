import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PreviewWindowState } from "../../shared/preview-window-contracts";
import {
  type PreviewControlActions,
  PreviewControls,
} from "./preview-controls";

const actions = {
  close: vi.fn(),
  cycleOpacity: vi.fn(),
  next: vi.fn(),
  openOriginal: vi.fn(),
  previous: vi.fn(),
  toggleFullscreen: vi.fn(),
  toggleGrayscale: vi.fn(),
  toggleMirror: vi.fn(),
  togglePin: vi.fn(),
  toggleSize: vi.fn(),
  toggleSlideshow: vi.fn(),
  rotate: vi.fn(),
  exportOriginal: vi.fn(),
} satisfies PreviewControlActions;

function previewState(
  patch: Partial<PreviewWindowState> = {},
): PreviewWindowState {
  return {
    windowId: 1,
    saveId: "save-1",
    fileIndex: 0,
    kind: "detached",
    title: "Preview",
    reduceMotion: "system",
    url: "pond://save-1/image.png",
    originalPath: "image.png",
    mediaType: "image",
    source: "original",
    fullscreen: false,
    opacity: 1,
    alwaysOnTop: true,
    rotation: 0,
    mirrored: false,
    grayscale: false,
    size: "fit",
    zoom: null,
    videoMuted: false,
    ...patch,
  };
}

describe("detached preview controls", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(() => root.unmount());
    container.remove();
  });

  async function render(state: PreviewWindowState, slideshow = false) {
    await act(() =>
      root.render(
        <PreviewControls
          actions={actions}
          slideshow={slideshow}
          state={state}
        />,
      ),
    );
  }

  it("renders compact image actions and dispatches their commands", async () => {
    await render(previewState({ mirrored: true, opacity: 0.8 }));

    expect(
      container
        .querySelector('[aria-label="Mirror"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      container.querySelector('[aria-label="Opacity: 80%"]'),
    ).not.toBeNull();

    const rotate = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Rotate"]',
    );
    if (!rotate) throw new Error("Missing Rotate control");
    rotate.click();
    expect(actions.rotate).toHaveBeenCalledOnce();
  });

  it("keeps image-only actions out of video previews", async () => {
    await render(
      previewState({
        mediaType: "video",
        url: "pond://save-1/video.mp4",
      }),
    );

    expect(container.querySelector('[aria-label="Rotate"]')).toBeNull();
    expect(container.querySelector('[aria-label="Mirror"]')).toBeNull();
    expect(container.querySelector('[aria-label="Grayscale"]')).toBeNull();
    expect(container.querySelector('[aria-label="Fullscreen"]')).not.toBeNull();
    expect(
      container.querySelector('[aria-label="Keep on Top"]'),
    ).not.toBeNull();
    expect(container.querySelector('[aria-label="Fill"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="Actual Size"]')).toBeNull();
    const fill = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Fill"]',
    );
    if (!fill) throw new Error("Missing Fill control");
    fill.click();
    expect(actions.toggleSize).toHaveBeenCalledOnce();

    await render(
      previewState({
        mediaType: "video",
        size: "fill",
        url: "pond://save-1/video.mp4",
      }),
    );
    expect(container.querySelector('[aria-label="Fit"]')).not.toBeNull();
  });

  it("keeps original-file actions available for generated previews", async () => {
    await render(
      previewState({
        source: "generated",
        originalPath: "capture.dng",
        url: "pond://save-1/capture.dng",
      }),
    );

    const open = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Open in Default App"]',
    );
    const exportOriginal = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Export Original"]',
    );
    if (!open || !exportOriginal) throw new Error("Missing original actions");
    open.click();
    exportOriginal.click();
    expect(actions.openOriginal).toHaveBeenCalledOnce();
    expect(actions.exportOriginal).toHaveBeenCalledOnce();
  });

  it("labels controls and exposes slideshow state", async () => {
    await render(previewState({ kind: "presentation" }), true);

    expect(container.querySelector('[aria-label="Previous"]')).not.toBeNull();
    expect(
      container
        .querySelector('[aria-pressed="true"][aria-label]')
        ?.getAttribute("aria-label"),
    ).toBe("Pause Slideshow");
  });
});
