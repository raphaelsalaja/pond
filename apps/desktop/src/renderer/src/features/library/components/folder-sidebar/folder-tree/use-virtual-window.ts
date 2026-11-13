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
 * Mounts only the rows inside the surrounding scroller plus overscan, because each dnd-kit re-measure scales with mounted rows.
 * @remarks `focusIds` always stay in the window so focus and drags can land outside the viewport.
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

  useLayoutEffect(() => {
    apply();
  }, [apply]);

  /** The scroller's direct children include the animated group, whose height changes without a scroll. */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const scroller = findScroller(container);
    scrollerRef.current = scroller;
    if (!scroller) return;
    const observer = new ResizeObserver(schedule);
    observer.observe(scroller);
    for (const child of Array.from(scroller.children)) observer.observe(child);
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
