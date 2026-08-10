// @vitest-environment jsdom

import { act, useCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  recallScroll,
  recallScrollAnchor,
  rememberScroll,
  ScrollRestorationContext,
  useScrollRestoration,
} from "@/hooks/use-scroll-restoration";
import { findScrollAnchor, PackedGrid, surroundingBandIndexes } from ".";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function RestorationHarness({
  detail,
  rowHeight = 100,
}: {
  detail: boolean;
  rowHeight?: number;
}) {
  const restoration = useScrollRestoration(
    detail ? "live-tab:/save/example" : "live-tab:/",
  );
  const attachScroller = useCallback(
    (node: HTMLDivElement | null) => {
      restoration.ref.current = node;
      if (!node) return;
      Object.defineProperty(node, "offsetHeight", {
        configurable: true,
        value: 600,
      });
      Object.defineProperty(node, "offsetWidth", {
        configurable: true,
        value: 1000,
      });
      node.scrollTo = ((options?: ScrollToOptions) => {
        if (options?.top != null) node.scrollTop = options.top;
      }) as typeof node.scrollTo;
    },
    [restoration],
  );

  if (detail) return <div data-detail />;
  return (
    <ScrollRestorationContext.Provider value={restoration}>
      <div ref={attachScroller} data-restoration-scroller>
        <PackedGrid
          layout="grid"
          totalHeight={rowHeight * 1000}
          items={Array.from({ length: 1000 }, (_, i) => ({
            id: String(i),
            top: i * rowHeight,
            left: 0,
            width: 100,
            height: rowHeight,
          }))}
          renderItem={(item) => <li key={item.id} />}
        />
      </div>
    </ScrollRestorationContext.Provider>
  );
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe("PackedGrid", () => {
  it("finds a stable leftmost card identity at the viewport top", () => {
    const anchor = findScrollAnchor(
      [
        { id: "a", top: 100, left: 100, width: 100, height: 200 },
        { id: "b", top: 100, left: 0, width: 100, height: 200 },
        { id: "c", top: 300, left: 0, width: 100, height: 200 },
      ].sort((a, b) => a.top - b.top || a.left - b.left),
      140,
    );

    expect(anchor).toEqual({
      item: { id: "b", top: 100, left: 0, width: 100, height: 200 },
      offset: 40,
    });
  });

  it("requests another page when the final eight packed items become visible", () => {
    const onEndReached = vi.fn();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <ScrollRestorationContext.Provider
          value={{ key: "end-test", ref: { current: container } }}
        >
          <PackedGrid
            layout="grid"
            totalHeight={1200}
            onEndReached={onEndReached}
            items={Array.from({ length: 8 }, (_, i) => ({
              id: String(i),
              top: i * 100,
              left: 0,
              width: 100,
              height: 100,
            }))}
            renderItem={() => null}
          />
        </ScrollRestorationContext.Provider>,
      );
    });

    expect(onEndReached).toHaveBeenCalledTimes(1);
  });

  it("mounts only the cards intersecting the virtualized viewport", async () => {
    container = document.createElement("div");
    container.style.height = "600px";
    container.style.overflowY = "auto";
    Object.defineProperty(container, "clientHeight", { value: 600 });
    Object.defineProperty(container, "offsetHeight", { value: 600 });
    Object.defineProperty(container, "offsetWidth", { value: 1000 });
    container.getBoundingClientRect = () =>
      ({
        x: 0,
        y: 0,
        top: 0,
        left: 0,
        right: 1000,
        bottom: 600,
        width: 1000,
        height: 600,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ScrollRestorationContext.Provider
          value={{ key: "bounded-test", ref: { current: container } }}
        >
          <PackedGrid
            layout="grid"
            totalHeight={100_000}
            items={Array.from({ length: 1000 }, (_, i) => ({
              id: String(i),
              top: i * 100,
              left: 0,
              width: 100,
              height: 100,
            }))}
            renderItem={(item) => <li key={item.id} data-item-id={item.id} />}
          />
        </ScrollRestorationContext.Provider>,
      );
    });

    await vi.waitFor(() => {
      const mounted = container?.querySelectorAll("[data-item-id]");
      expect(mounted?.length).toBeGreaterThan(0);
      expect(mounted?.length).toBeLessThan(100);
    });
  });

  it("binds the remembered offset to the virtualized scroll element", async () => {
    const key = "virtualizer-restore-test";
    rememberScroll(key, 2500);
    container = document.createElement("div");
    container.style.overflowY = "auto";
    Object.defineProperty(container, "offsetHeight", { value: 600 });
    Object.defineProperty(container, "offsetWidth", { value: 1000 });
    container.scrollTo = vi.fn(
      (optionsOrX?: ScrollToOptions | number, y?: number) => {
        const top = typeof optionsOrX === "number" ? y : optionsOrX?.top;
        if (top != null && container) container.scrollTop = top;
      },
    ) as typeof container.scrollTo;
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(
        <ScrollRestorationContext.Provider
          value={{ key, ref: { current: container } }}
        >
          <PackedGrid
            layout="grid"
            totalHeight={100_000}
            items={Array.from({ length: 1000 }, (_, i) => ({
              id: String(i),
              top: i * 100,
              left: 0,
              width: 100,
              height: 100,
            }))}
            renderItem={(item) => <li key={item.id} />}
          />
        </ScrollRestorationContext.Provider>,
      );
    });

    expect(container.scrollTop).toBe(2500);
    await act(async () => {
      if (!container) return;
      container.scrollTop = 3200;
      container.dispatchEvent(new Event("scroll"));
      await new Promise(requestAnimationFrame);
    });
    await vi.waitFor(() => expect(recallScroll(key)).toBe(3200));
  });

  it("restores the same grid offset after opening a detail and returning", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<RestorationHarness detail={false} />);
    });
    const firstScroller = container.querySelector<HTMLDivElement>(
      "[data-restoration-scroller]",
    );
    expect(firstScroller).not.toBeNull();

    await act(async () => {
      if (!firstScroller) return;
      firstScroller.scrollTop = 2500;
      firstScroller.dispatchEvent(new Event("scroll"));
      await new Promise(requestAnimationFrame);
    });
    expect(recallScroll("live-tab:/")).toBe(2500);
    await vi.waitFor(() =>
      expect(recallScrollAnchor("live-tab:/")).toEqual({
        id: "25",
        offset: 0,
      }),
    );

    await act(async () => {
      root?.render(<RestorationHarness detail rowHeight={60} />);
    });
    await act(async () => {
      root?.render(<RestorationHarness detail={false} rowHeight={60} />);
    });

    await vi.waitFor(() => {
      const restoredScroller = container?.querySelector<HTMLDivElement>(
        "[data-restoration-scroller]",
      );
      /** Same card 25, now repacked to a different pixel position. */
      expect(restoredScroller?.scrollTop).toBe(1500);
    });
  });

  it("keeps the exact offset when a repack only changes by a pixel", async () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    await act(async () => {
      root?.render(<RestorationHarness detail={false} />);
    });
    const firstScroller = container.querySelector<HTMLDivElement>(
      "[data-restoration-scroller]",
    );

    await act(async () => {
      if (!firstScroller) return;
      firstScroller.scrollTop = 2500;
      firstScroller.dispatchEvent(new Event("scroll"));
      await new Promise(requestAnimationFrame);
    });
    await vi.waitFor(() =>
      expect(recallScrollAnchor("live-tab:/")).toEqual({
        id: "25",
        offset: 0,
      }),
    );

    await act(async () => {
      root?.render(<RestorationHarness detail rowHeight={100.04} />);
    });
    await act(async () => {
      root?.render(<RestorationHarness detail={false} rowHeight={100.04} />);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });

    const restoredScroller = container.querySelector<HTMLDivElement>(
      "[data-restoration-scroller]",
    );
    expect(restoredScroller?.scrollTop).toBe(2500);
  });
});

describe("surroundingBandIndexes", () => {
  it("returns a bounded runway outside the mounted bands", () => {
    expect(surroundingBandIndexes([5, 6, 7], 20, 2)).toEqual([3, 4, 8, 9]);
  });

  it("clamps the runway to the virtual surface", () => {
    expect(surroundingBandIndexes([0, 1], 4, 3)).toEqual([2, 3]);
  });
});
