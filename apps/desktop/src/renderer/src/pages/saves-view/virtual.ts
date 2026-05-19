import { useEffect, useMemo, useState } from "react";

// Walks up from `el` until it finds the nearest ancestor whose
// computed overflow on the block axis allows scrolling. Falls back
// to `document.documentElement` so the math still works for stories
// / standalone usage where there's no `<main>`.
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    const style = getComputedStyle(node);
    const oy = style.overflowY;
    if (oy === "auto" || oy === "scroll" || oy === "overlay") return node;
    node = node.parentElement;
  }
  return document.documentElement;
}

interface PositionedItem {
  top: number;
  height: number;
}

const OVERSCAN_PX = 600;

// Returns the subset of indices into `items` whose vertical extent
// overlaps the scroll viewport (plus an overscan band). The waterfall
// packer interleaves columns so item ordering is not monotonic by
// `top` — we scan every item, but the per-item comparison is two
// numeric checks and stays well under a millisecond for thousands
// of items.
export function useVisibleIndices<T extends PositionedItem>(
  ref: React.RefObject<HTMLElement | null>,
  items: T[],
): number[] {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const node = ref.current;
    const parent = findScrollParent(node);
    if (!parent) return;

    let raf = 0;
    const bump = () => {
      if (raf !== 0) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setTick((n) => (n + 1) & 0xff);
      });
    };
    parent.addEventListener("scroll", bump, { passive: true });
    window.addEventListener("resize", bump, { passive: true });
    return () => {
      parent.removeEventListener("scroll", bump);
      window.removeEventListener("resize", bump);
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [ref]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` is the live re-render signal; reading `ref.current` here is intentional.
  return useMemo(() => {
    void tick;
    const node = ref.current;
    const parent = findScrollParent(node);
    if (!node || !parent || items.length === 0) {
      return items.map((_, i) => i);
    }
    const parentRect = parent.getBoundingClientRect();
    const gridRect = node.getBoundingClientRect();
    const offsetWithinGrid = parentRect.top - gridRect.top;
    const viewMin = offsetWithinGrid - OVERSCAN_PX;
    const viewMax = offsetWithinGrid + parent.clientHeight + OVERSCAN_PX;

    const out: number[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      if (item.top + item.height < viewMin) continue;
      if (item.top > viewMax) continue;
      out.push(i);
    }
    return out;
  }, [items, tick]);
}
