import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resultNavigation } from "@/features/saves/state/result-navigation";
import { ImageControls } from ".";

describe("image inspector toolbar", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    resultNavigation.setSource({ ids: ["image"], total: 493 });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("shows the compact image action sequence at the small size", async () => {
    const noop = vi.fn();
    await act(async () =>
      root.render(
        <ImageControls.Hud
          actual={1}
          active
          busy={false}
          canCrop={false}
          saveId="image"
          mode="view"
          onActualSize={noop}
          onApplyCrop={noop}
          onCancelCrop={noop}
          onFit={noop}
          onFlip={noop}
          onRotate={noop}
          onSaveCrop={noop}
          onToggleCrop={noop}
          onZoomIn={noop}
          onZoomOut={noop}
          onZoomRatio={noop}
        />,
      ),
    );

    const labels = [...host.querySelectorAll("button")]
      .map((button) => button.getAttribute("aria-label"))
      .filter((label): label is string => label !== null);
    expect(labels).toEqual([
      "Previous Save",
      "Next Save",
      "Zoom Out",
      "Zoom Ratio",
      "Zoom In",
      "Flip",
      "Rotate",
      "Crop",
      "Actual Size",
      "Fit to Window",
    ]);
    expect(host.textContent).not.toContain("1 / 493");
    const end = host.querySelector('[data-viewer-bar-slot="end"]');
    expect(end?.childElementCount).toBe(0);
    const start = host.querySelector('[data-viewer-bar-slot="start"]');
    expect(start?.textContent).toBe("");
    expect(
      start?.querySelector<HTMLButtonElement>('[aria-label="Previous Save"]')
        ?.disabled,
    ).toBe(true);
    expect(host.querySelectorAll('[role="separator"]')).toHaveLength(0);

    for (const label of labels) {
      const button = host.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      );
      expect(button, label).not.toBeNull();
      expect(button?.dataset.size, label).toBe("sm");
    }
  });

  it("adds GIF Frames without adding a separator", async () => {
    const noop = vi.fn();
    await act(async () =>
      root.render(
        <ImageControls.Hud
          actual={1}
          active
          busy={false}
          canCrop={false}
          saveId="image"
          isGif
          gifFramesOpen
          mode="view"
          onActualSize={noop}
          onApplyCrop={noop}
          onCancelCrop={noop}
          onFit={noop}
          onFlip={noop}
          onRotate={noop}
          onSaveCrop={noop}
          onToggleCrop={noop}
          onToggleGifFrames={noop}
          onZoomIn={noop}
          onZoomOut={noop}
          onZoomRatio={noop}
        />,
      ),
    );

    expect(host.querySelector('[aria-label="GIF Frames"]')).not.toBeNull();
    expect(host.querySelectorAll('[role="separator"]')).toHaveLength(0);
  });

  it("keeps view controls but hides destructive edits when edits are disabled", async () => {
    const noop = vi.fn();
    await act(async () =>
      root.render(
        <ImageControls.Hud
          actual={1}
          active
          busy={false}
          canCrop={false}
          edits="none"
          saveId="image"
          mode="view"
          onActualSize={noop}
          onApplyCrop={noop}
          onCancelCrop={noop}
          onFit={noop}
          onFlip={noop}
          onRotate={noop}
          onSaveCrop={noop}
          onToggleCrop={noop}
          onZoomIn={noop}
          onZoomOut={noop}
          onZoomRatio={noop}
        />,
      ),
    );

    const labeled = (label: string) =>
      host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    expect(labeled("Actual Size")).not.toBeNull();
    expect(labeled("Fit to Window")).not.toBeNull();
    expect(labeled("Flip")).toBeNull();
    expect(labeled("Rotate")).toBeNull();
    expect(labeled("Crop")).toBeNull();
  });

  it("puts three tooltip-backed icon actions at the end of crop mode", async () => {
    const noop = vi.fn();
    await act(async () =>
      root.render(
        <ImageControls.Hud
          actual={1}
          active
          busy={false}
          canCrop
          saveId="image"
          mode="crop"
          onActualSize={noop}
          onApplyCrop={noop}
          onCancelCrop={noop}
          onFit={noop}
          onFlip={noop}
          onRotate={noop}
          onSaveCrop={noop}
          onToggleCrop={noop}
          onZoomIn={noop}
          onZoomOut={noop}
          onZoomRatio={noop}
        />,
      ),
    );

    expect(host.textContent).not.toContain("Select an area to crop");
    expect(host.querySelector('[aria-label="Aspect Ratio"]')).toBeNull();
    const actions = ["Apply Crop", "Save as New Image", "Cancel"];
    for (const label of actions) {
      const button = host.querySelector<HTMLButtonElement>(
        `button[aria-label="${label}"]`,
      );
      expect(button, label).not.toBeNull();
      expect(
        button?.closest('[data-viewer-bar-slot="end"]'),
        `${label} should be in the top-right group`,
      ).not.toBeNull();
      expect(button?.textContent, `${label} should be icon-only`).toBe("");
    }
  });
});
