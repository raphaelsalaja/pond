import { expect, it } from "vitest";
import { followInterfaceZoom } from "./follow-interface-zoom";

type ZoomPrefs = { window: { interfaceZoom: number } };

function setup(stored: number) {
  const factors: Array<number> = [];
  const listeners = new Set<(prefs: ZoomPrefs) => void>();
  const handlers: Record<string, () => void> = {};
  let destroyed = false;
  const contents = {
    isDestroyed: () => destroyed,
    setZoomFactor: (factor: number) => factors.push(factor),
    on: (event: string, listener: () => void) => {
      handlers[event] = listener;
    },
    once: (event: string, listener: () => void) => {
      handlers[event] = listener;
    },
  };
  followInterfaceZoom(contents, {
    getPrefs: async () => ({ window: { interfaceZoom: stored } }),
    subscribePrefs: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  return {
    factors,
    listeners,
    load: async () => {
      handlers["did-finish-load"]?.();
      await Promise.resolve();
    },
    change: (interfaceZoom: number) => {
      for (const listener of listeners) {
        listener({ window: { interfaceZoom } });
      }
    },
    destroy: () => {
      destroyed = true;
      handlers.destroyed?.();
    },
  };
}

it("applies the stored zoom when the page loads", async () => {
  const window = setup(155);
  await window.load();
  expect(window.factors).toEqual([1.55]);
});

it("follows zoom changes from Settings", () => {
  const window = setup(100);
  window.change(125);
  window.change(75);
  expect(window.factors).toEqual([1.25, 0.75]);
});

it("stops listening once the window is destroyed", () => {
  const window = setup(100);
  window.destroy();
  expect(window.listeners.size).toBe(0);
  window.change(150);
  expect(window.factors).toEqual([]);
});
