import { afterEach, describe, expect, it, vi } from "vitest";
import { observeSettledSize } from "./settled-resize";
import type { SettledSizeHost } from "./settled-resize";

function fakeHost() {
  const observed: Array<HTMLElement> = [];
  const listeners: Array<() => void> = [];
  const frames = new Map<number, () => void>();
  let requestedFrames = 0;
  const host: SettledSizeHost = {
    observe: (element, onResize) => {
      observed.push(element);
      listeners.push(onResize);
      return () => {
        listeners.splice(listeners.indexOf(onResize), 1);
      };
    },
    requestFrame: (callback) => {
      requestedFrames += 1;
      frames.set(requestedFrames, callback);
      return requestedFrames;
    },
    cancelFrame: (id) => {
      frames.delete(id);
    },
  };
  return {
    host,
    observed,
    resize: () => {
      for (const listener of listeners) {
        listener();
      }
    },
    runFrames: () => {
      const pending = [...frames.values()];
      frames.clear();
      for (const frame of pending) {
        frame();
      }
    },
    requestedFrames: () => requestedFrames,
  };
}

describe("observeSettledSize", () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it("measures immediately, then waits for the size to settle", () => {
    const { host, observed, resize } = fakeHost();
    vi.useFakeTimers();
    const el = document.createElement("div");
    document.body.append(el);
    const onSize = vi.fn();
    const stop = observeSettledSize(el, onSize, {}, host);
    expect(observed).toEqual([el]);
    expect(onSize).toHaveBeenCalledTimes(1);

    resize();
    resize();
    expect(onSize).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(63);
    expect(onSize).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(onSize).toHaveBeenCalledTimes(2);

    stop();
  });

  it("measures every frame while a pane is being dragged", () => {
    const { host, resize, runFrames } = fakeHost();
    const root = document.createElement("div");
    root.dataset.slot = "window";
    root.dataset.resizing = "left";
    const el = document.createElement("div");
    root.append(el);
    document.body.append(root);
    const onSize = vi.fn();
    const stop = observeSettledSize(el, onSize, {}, host);
    onSize.mockClear();

    resize();
    runFrames();
    expect(onSize).toHaveBeenCalledTimes(1);

    stop();
  });

  it("coalesces continuous size changes into one frame", () => {
    const { host, resize, runFrames, requestedFrames } = fakeHost();
    const el = document.createElement("div");
    document.body.append(el);
    const onSize = vi.fn();
    const stop = observeSettledSize(el, onSize, { continuous: true }, host);
    onSize.mockClear();

    resize();
    resize();
    expect(requestedFrames()).toBe(1);
    expect(onSize).not.toHaveBeenCalled();

    runFrames();
    expect(onSize).toHaveBeenCalledTimes(1);

    stop();
  });

  it("measures a discrete pane layout change before the next frame", () => {
    const { host, resize, requestedFrames } = fakeHost();
    const root = document.createElement("div");
    root.dataset.slot = "window";
    root.dataset.layoutTransition = "";
    const el = document.createElement("div");
    root.append(el);
    document.body.append(root);
    const onSize = vi.fn();
    const stop = observeSettledSize(el, onSize, { continuous: true }, host);
    onSize.mockClear();

    resize();

    expect(onSize).toHaveBeenCalledTimes(1);
    expect(requestedFrames()).toBe(0);

    stop();
  });

  it("measures when a pane width transition ends", () => {
    const { host } = fakeHost();
    const root = document.createElement("div");
    root.dataset.slot = "window";
    const el = document.createElement("div");
    root.append(el);
    document.body.append(root);
    const onSize = vi.fn();
    const stop = observeSettledSize(el, onSize, {}, host);
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
    const { host, resize, runFrames } = fakeHost();
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
    const stop = observeSettledSize(el, onSize, { continuous: true }, host);
    onSize.mockClear();

    for (let frame = 0; frame < 12; frame++) {
      resize();
      runFrames();
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
