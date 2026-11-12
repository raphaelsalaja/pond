import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

/** One tree row: a 28px `Sidebar.Item` plus the 1px gap between rows. */
export const FOLDER_ROW_SLOT = 29;

const OVERSCAN = 8;
const INITIAL_ROWS = 48;

export interface RowWindow {
  /** Index of the first mounted row. */
  first: number;
  /** Index one past the last mounted row. */
  last: number;
}

function findScroller(element: HTMLElement | null): HTMLElement | null {
  let node = element?.parentElement ?? null;
  while (node) {
    const overflow = getComputedStyle(node).overflowY;
    if (overflow === "auto" || overflow === "scroll") return node;
    node = node.parentElement;
  }
  return null;
}

/**
 * Fixed-size virtual window for the flat folder tree.
 *
 * The tree can hold thousands of rows, but the sidebar viewport only shows a
 * few dozen at a time, and every dnd-kit node re-measure (scroll,
 * occlusion, re-sort, resize) is expensive under software rendering. This
 * hook reports which slice of the row list is mounted: the rows intersecting
 * the surrounding scroll container (the sidebar's `Sidebar.Scroll`) plus
 * overscan, and always the `focusIds` (keyboard cursor, dragged row) so
 * focus and dragging can land on rows outside the visible range.
 *
 * The consumer renders an in-flow spacer the height of the full list and an
 * absolutely positioned window translated to `first * FOLDER_ROW_SLOT`.
 */
export function useVirtualWindow<T extends HTMLElement>(
  containerRef: RefObject<T | null>,
  count: number,
  focusIds: readonly string[],
  indexOf: (id: string) => number | undefined,
): RowWindow {
  const [range, setRange] = useState<RowWindow>(() => ({
    first: 0,
    last: Math.min(count, INITIAL_ROWS),
  }));
  const scrollerRef = useRef<HTMLElement | null>(null);
  const rafRef = useRef(0);
  const apply = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    let scroller = scrollerRef.current;
    if (!scroller?.isConnected) {
      scroller = findScroller(container);
      scrollerRef.current = scroller;
    }
    if (!scroller) {
      // No measurable scroll container (jsdom, headless): there is no
      // viewport to virtualize against, so mount the whole list.
      setRange((previous) =>
        previous.first === 0 && previous.last === count
          ? previous
          : { first: 0, last: count },
      );
      return;
    }
    const containerTop =
      container.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;
    const start = scroller.scrollTop - containerTop;
    const end = scroller.scrollTop + scroller.clientHeight - containerTop;
    let first = Math.floor(start / FOLDER_ROW_SLOT) - OVERSCAN;
    let last = Math.ceil(end / FOLDER_ROW_SLOT) + OVERSCAN;
    for (const id of focusIds) {
      const index = indexOf(id);
      if (index === undefined) continue;
      first = Math.min(first, index - OVERSCAN);
      last = Math.max(last, index + OVERSCAN + 1);
    }
    first = Math.max(0, Math.min(first, count));
    last = Math.max(first, Math.min(last, count));
    setRange((previous) =>
      previous.first === first && previous.last === last
        ? previous
        : {
            first,
            last,
          },
    );
  }, [count, focusIds, indexOf, containerRef]);

  const applyRef = useRef(apply);
  applyRef.current = apply;

  const schedule = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      applyRef.current();
    });
  }, []);

  // Re-measure before paint whenever the row list or the focus rows change
  // (mount, re-sort, count update, cursor move) so the first frame after a
  // change already shows the right window.
  useLayoutEffect(() => {
    apply();
  }, [apply]);

  // Track the surrounding scroll container: scroll ticks plus size changes
  // of the scroller and of its direct children (the sidebar sections,
  // including the animated group).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scroller = findScroller(container);
    scrollerRef.current = scroller;
    if (!scroller) return;
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    for (const child of Array.from(scroller.children))
      observer.observe(child as Element);
    window.addEventListener("resize", schedule);
    scroller.addEventListener("scroll", schedule, { passive: true });
    apply();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", schedule);
      scroller.removeEventListener("scroll", schedule);
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [apply, containerRef, schedule]);

  useEffect(
    () => () => {
      scrollerRef.current = null;
    },
    [],
  );

  return range;
}
