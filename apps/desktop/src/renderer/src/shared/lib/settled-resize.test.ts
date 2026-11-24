import { afterEach, describe, expect, it, vi } from "vitest";
import { observeSettledSize } from "./settled-resize";

const observers: FakeResizeObserver[] = [];

class FakeResizeObserver implements ResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    observers.push(this);
  }
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

function fireResize(): void {
  for (const observer of observers) {
    observer.callback([], observer);
  }
}

describe("observeSettledSize", () => {
  afterEach(() => {
    observers.length = 0;
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("measures immediately, then waits for the size to settle", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.useFakeTimers();
    const el = document.createElement("div");
    document.body.append(el);
    const onSize = vi.fn();
    const stop = observeSettledSize(el, onSize);
    expect(onSize).toHaveBeenCalledTimes(1);

    fireResize();
    fireResize();
    expect(onSize).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(63);
    expect(onSize).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(onSize).toHaveBeenCalledTimes(2);

    stop();
  });

  it("measures every frame while a pane is being dragged", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const raf = vi.fn((cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const root = document.createElement("div");
    root.dataset.slot = "window";
    root.dataset.resizing = "left";
    const el = document.createElement("div");
    root.append(el);
    document.body.append(root);
    const onSize = vi.fn();
    const stop = observeSettledSize(el, onSize);
    onSize.mockClear();

    fireResize();
    expect(onSize).toHaveBeenCalledTimes(1);

    stop();
  });

  it("coalesces continuous size changes into one frame", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    let nextFrame: FrameRequestCallback | undefined;
    const raf = vi.fn((callback: FrameRequestCallback) => {
      nextFrame = callback;
      return 1;
    });
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const el = document.createElement("div");
    document.body.append(el);
    const onSize = vi.fn();
    const stop = observeSettledSize(el, onSize, { continuous: true });
    onSize.mockClear();

    fireResize();
    fireResize();
    expect(raf).toHaveBeenCalledTimes(1);
    expect(onSize).not.toHaveBeenCalled();

    nextFrame?.(0);
    expect(onSize).toHaveBeenCalledTimes(1);

    stop();
  });

  it("measures a discrete pane layout change before the next frame", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const raf = vi.fn(() => 1);
    vi.stubGlobal("requestAnimationFrame", raf);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    const root = document.createElement("div");
    root.dataset.slot = "window";
    root.dataset.layoutTransition = "";
    const el = document.createElement("div");
    root.append(el);
    document.body.append(root);
    const onSize = vi.fn();
    const stop = observeSettledSize(el, onSize, { continuous: true });
    onSize.mockClear();

    fireResize();

    expect(onSize).toHaveBeenCalledTimes(1);
    expect(raf).not.toHaveBeenCalled();

    stop();
  });

  it("measures when a pane width transition ends", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    const root = document.createElement("div");
    root.dataset.slot = "window";
    const el = document.createElement("div");
    root.append(el);
    document.body.append(root);
    const onSize = vi.fn();
    const stop = observeSettledSize(el, onSize);
    onSize.mockClear();

    root.dispatchEvent(
      new TransitionEvent("transitionend", {
        propertyName: "--window-left-width",
        bubbles: true,
      }),
    );
    expect(onSize).toHaveBeenCalledTimes(1);

    stop();
  });

  it("does not repack during an animated pane width change", () => {
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.useFakeTimers();
    const root = document.createElement("div");
    root.dataset.slot = "window";
    const panes = document.createElement("div");
    panes.dataset.slot = "panes";
    root.append(panes);
    let running = true;
    Object.defineProperty(panes, "getAnimations", {
      value: () =>
        running
          ? [
              {
                transitionProperty: "--window-left-width",
                playState: "running",
              },
            ]
          : [],
    });
    const el = document.createElement("div");
    panes.append(el);
    document.body.append(root);
    const onSize = vi.fn();
    const stop = observeSettledSize(el, onSize, { continuous: true });
    onSize.mockClear();

    for (let frame = 0; frame < 12; frame++) {
      fireResize();
      vi.advanceTimersByTime(16);
    }
    expect(onSize).not.toHaveBeenCalled();

    running = false;
    root.dispatchEvent(
      new TransitionEvent("transitionend", {
        propertyName: "--window-left-width",
        bubbles: true,
      }),
    );
    expect(onSize).toHaveBeenCalledTimes(1);
    stop();
  });
});
