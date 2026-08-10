import { CARD_LQIP_WIDTH } from "@shared/media-index";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type GridLayout,
  LibraryGrid,
} from "@/components/library/layouts/grid";
import { SaveCard } from "@/components/save/card";
import type { CardLayout } from "@/components/save/card/media";
import { useMultiSelectActive } from "@/components/shared/grid-context";
import { useResolvedTheme } from "@/hooks/use-resolved-theme";
import {
  recallScroll,
  recallScrollAnchor,
  rememberScroll,
  rememberScrollAnchor,
  type ScrollAnchor,
  ScrollRestorationContext,
} from "@/hooks/use-scroll-restoration";
import { cardPreviewSource } from "@/lib/media/card-preview";
import { retainPreviewRunway } from "@/lib/media/preview-runway";
import { pickPrimaryUnit } from "@/lib/media/units";
import { withThumbWidth } from "@/lib/media/url";
import { findScrollParent } from "@/lib/util/dom";
import { pool } from "@/stores/pool";
import { usePrefs } from "@/stores/prefs";
import type { PackedItem } from "./uniform-pack";
import {
  buildVirtualBands,
  indicesForVirtualBands,
  PACKED_GRID_BAND_PX,
} from "./virtual-bands";

export type { PackedItem, PackResult } from "./uniform-pack";
export { LIBRARY_ITEM_GAP, packUniform } from "./uniform-pack";

const END_THRESHOLD_ITEMS = 8;
const BAND_OVERSCAN = 3;
const LQIP_RUNWAY_BANDS = 6;
const estimateBandSize = () => PACKED_GRID_BAND_PX;
const virtualBandKey = (index: number) => `packed-grid-band-${index}`;
const INITIAL_VIEWPORT_RECT = {
  width: typeof window === "undefined" ? 0 : window.innerWidth,
  height: typeof window === "undefined" ? 1000 : window.innerHeight,
};
const RESTORATION_SETTLE_MS = 750;
const MISSING_ANCHOR_TIMEOUT_MS = 5000;
/** Preserve the exact pixel position when a fresh layout only differs by sub-pixel rounding. */
const ANCHOR_RESTORE_TOLERANCE_PX = 2;

export function findScrollAnchor(
  itemsByTop: ReadonlyArray<PackedItem>,
  localScrollTop: number,
): { item: PackedItem; offset: number } | null {
  if (itemsByTop.length === 0) return null;
  let low = 0;
  let high = itemsByTop.length - 1;
  let best = 0;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const item = itemsByTop[mid];
    if (!item) break;
    if (item.top <= localScrollTop) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  const bestItem = itemsByTop[best];
  if (!bestItem) return null;
  /** Pick the leftmost card when several columns begin on the same row. */
  while (best > 0 && itemsByTop[best - 1]?.top === bestItem.top) best -= 1;
  const item = itemsByTop[best];
  if (!item) return null;
  return { item, offset: Math.max(0, localScrollTop - item.top) };
}

interface PackedGridProps {
  layout: GridLayout;
  items: PackedItem[];
  totalHeight: number;
  /** Called once the visible window reaches the final rows of the grid. */
  onEndReached?: () => void;
  renderItem: (item: PackedItem) => ReactNode;
  /** Cheap low-resolution previews to retain outside the mounted card window. */
  onRunwayChange?: (itemIndexes: readonly number[]) => void;
}

export function surroundingBandIndexes(
  mounted: readonly number[],
  count: number,
  runway = LQIP_RUNWAY_BANDS,
): number[] {
  if (mounted.length === 0 || count <= 0 || runway <= 0) return [];
  const first = Math.min(...mounted);
  const last = Math.max(...mounted);
  const result: number[] = [];
  for (let i = Math.max(0, first - runway); i < first; i += 1) result.push(i);
  for (let i = last + 1; i <= Math.min(count - 1, last + runway); i += 1) {
    result.push(i);
  }
  return result;
}

export function PackedGrid({
  layout,
  items,
  totalHeight,
  onEndReached,
  renderItem,
  onRunwayChange,
}: PackedGridProps) {
  const ref = useRef<HTMLUListElement>(null);
  const restoration = useContext(ScrollRestorationContext);
  const restorationKey = restoration?.key ?? null;
  const initializedRestorationKey = useRef<string | null | undefined>(
    undefined,
  );
  const activeRestoration = useRef<{
    key: string;
    anchor: ScrollAnchor;
    top: number;
  } | null>(null);
  const restorationSettleTimer = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  if (initializedRestorationKey.current !== restorationKey) {
    initializedRestorationKey.current = restorationKey;
    const anchor = restorationKey ? recallScrollAnchor(restorationKey) : null;
    activeRestoration.current =
      restorationKey && anchor
        ? { key: restorationKey, anchor, top: recallScroll(restorationKey) }
        : null;
  }
  const multiSelectActive = useMultiSelectActive();
  const style = useMemo<React.CSSProperties>(
    () => ({ height: `${totalHeight}px` }),
    [totalHeight],
  );
  const bands = useMemo(
    () => buildVirtualBands(items, totalHeight),
    [items, totalHeight],
  );
  const itemsByTop = useMemo(
    () => [...items].sort((a, b) => a.top - b.top || a.left - b.left),
    [items],
  );
  const itemById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items],
  );
  const getScrollElement = useCallback(
    () => restoration?.ref.current ?? findScrollParent(ref.current),
    [restoration],
  );
  const [scrollMargin, setScrollMargin] = useState(0);

  /** The grid can sit below route chrome; TanStack needs that stable offset within Shell.Main. */
  useLayoutEffect(() => {
    const node = ref.current;
    const parent = restoration?.ref.current ?? findScrollParent(node);
    if (!node || !parent) return;

    const measure = () => {
      const parentRect = parent.getBoundingClientRect();
      const gridRect = node.getBoundingClientRect();
      const next = parent.scrollTop + gridRect.top - parentRect.top;
      setScrollMargin((current) =>
        Math.abs(current - next) < 0.5 ? current : next,
      );
    };
    measure();

    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    observer?.observe(node);
    observer?.observe(parent);
    if (node.parentElement) observer?.observe(node.parentElement);
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [restoration]);

  /**
   * Re-anchor by card identity after layout/aspect changes; a bare pixel is only the fallback.
   * Keep the original anchor locked while the paged pool fills because every newly sorted page can
   * move that card. Programmatic jumps during this transaction must never become a new user anchor.
   */
  useLayoutEffect(() => {
    if (!restoration) return;
    const parent = getScrollElement();
    const active = activeRestoration.current;
    if (!parent || !active || active.key !== restoration.key) return;
    parent.dataset.restoringScroll = "";
    const item = itemById.get(active.anchor.id);
    if (!item) {
      if (restorationSettleTimer.current !== null) {
        clearTimeout(restorationSettleTimer.current);
      }
      restorationSettleTimer.current = setTimeout(() => {
        if (activeRestoration.current !== active) return;
        activeRestoration.current = null;
        delete parent.dataset.restoringScroll;
        restorationSettleTimer.current = null;
      }, MISSING_ANCHOR_TIMEOUT_MS);
      return;
    }
    const target = scrollMargin + item.top + active.anchor.offset;
    let innerFrame = 0;
    const outerFrame = requestAnimationFrame(() => {
      innerFrame = requestAnimationFrame(() => {
        /**
         * `useScrollRestoration` has already restored the precise saved offset.
         * Only let the identity anchor take over for a meaningful layout change;
         * otherwise fractional packing measurements make returning from a save
         * visibly nudge the library by a pixel or two.
         */
        const savedTop = active.top;
        const nextTop =
          Math.abs(savedTop - target) <= ANCHOR_RESTORE_TOLERANCE_PX
            ? savedTop
            : target;
        if (parent.scrollTop !== nextTop) parent.scrollTop = nextTop;
        if (nextTop !== savedTop) rememberScroll(restoration.key, nextTop);
        if (restorationSettleTimer.current !== null) {
          clearTimeout(restorationSettleTimer.current);
        }
        restorationSettleTimer.current = setTimeout(() => {
          if (activeRestoration.current !== active) return;
          activeRestoration.current = null;
          delete parent.dataset.restoringScroll;
          restorationSettleTimer.current = null;
        }, RESTORATION_SETTLE_MS);
      });
    });
    return () => {
      cancelAnimationFrame(outerFrame);
      if (innerFrame !== 0) cancelAnimationFrame(innerFrame);
      if (restorationSettleTimer.current !== null) {
        clearTimeout(restorationSettleTimer.current);
        restorationSettleTimer.current = null;
      }
    };
  }, [getScrollElement, itemById, restoration, scrollMargin]);

  /** Explicit user input cancels an in-flight cold-start restore instead of fighting the user. */
  useEffect(() => {
    const parent = getScrollElement();
    if (!parent) return;
    const cancel = () => {
      activeRestoration.current = null;
      if (restorationSettleTimer.current !== null) {
        clearTimeout(restorationSettleTimer.current);
        restorationSettleTimer.current = null;
      }
      delete parent.dataset.restoringScroll;
    };
    parent.addEventListener("wheel", cancel, { passive: true });
    parent.addEventListener("touchstart", cancel, { passive: true });
    return () => {
      parent.removeEventListener("wheel", cancel);
      parent.removeEventListener("touchstart", cancel);
      if (restorationSettleTimer.current !== null) {
        clearTimeout(restorationSettleTimer.current);
        restorationSettleTimer.current = null;
      }
      delete parent.dataset.restoringScroll;
    };
  }, [getScrollElement]);

  const virtualizer = useVirtualizer({
    count: bands.length,
    getScrollElement,
    estimateSize: estimateBandSize,
    getItemKey: virtualBandKey,
    overscan: BAND_OVERSCAN,
    /** Scroll events may be frequent; let React batch range changes instead of forcing synchronous commits. */
    useFlushSync: false,
    scrollMargin,
    initialOffset: () => {
      if (!restoration) return 0;
      const active = activeRestoration.current;
      const anchor = active?.anchor ?? recallScrollAnchor(restoration.key);
      const savedTop = active?.top ?? recallScroll(restoration.key);
      if (!anchor) return savedTop;
      const item = itemById.get(anchor.id);
      if (!item) return savedTop;
      const anchoredTop = scrollMargin + item.top + anchor.offset;
      return Math.abs(savedTop - anchoredTop) <= ANCHOR_RESTORE_TOLERANCE_PX
        ? savedTop
        : anchoredTop;
    },
    onChange: (instance, sync) => {
      if (!sync || !restoration || instance.scrollOffset == null) return;
      if (activeRestoration.current?.key === restoration.key) return;
      const parent = getScrollElement();
      if (!parent || "restoringScroll" in parent.dataset) return;
      const top = instance.scrollOffset;
      const anchor = findScrollAnchor(
        itemsByTop,
        Math.max(0, top - scrollMargin),
      );
      if (!anchor) return;
      rememberScrollAnchor(restoration.key, top, {
        id: anchor.item.id,
        offset: anchor.offset,
      });
    },
    initialRect: INITIAL_VIEWPORT_RECT,
  });
  const virtualBandIndexes = virtualizer.getVirtualIndexes();
  const visible = useMemo(
    () => indicesForVirtualBands(bands, virtualBandIndexes),
    [bands, virtualBandIndexes],
  );
  const runway = useMemo(() => {
    const mounted = new Set(visible);
    return indicesForVirtualBands(
      bands,
      surroundingBandIndexes(virtualBandIndexes, bands.length),
    ).filter((index) => !mounted.has(index));
  }, [bands, virtualBandIndexes, visible]);
  const endReached = useRef(false);

  useEffect(() => {
    onRunwayChange?.(runway);
  }, [onRunwayChange, runway]);

  useEffect(() => {
    const nearEnd =
      (visible.at(-1) ?? -1) >= items.length - END_THRESHOLD_ITEMS;
    if (!nearEnd) {
      endReached.current = false;
    } else if (!endReached.current && onEndReached) {
      endReached.current = true;
      onEndReached?.();
    }
  }, [visible, items.length, onEndReached]);

  return (
    <LibraryGrid.Grid
      ref={ref}
      layout={layout}
      multiSelect={multiSelectActive}
      style={style}
    >
      {visible.map((i) => {
        const it = items[i];
        if (!it) return null;
        return renderItem(it);
      })}
    </LibraryGrid.Grid>
  );
}

interface SavePackedGridProps {
  layout: GridLayout;
  items: PackedItem[];
  totalHeight: number;
  onEndReached?: () => void;
}

/** Library save layouts: windowed PackedGrid that always mounts SaveCard. */
export function SavePackedGrid({
  layout,
  items,
  totalHeight,
  onEndReached,
}: SavePackedGridProps) {
  const theme = useResolvedTheme();
  const [preferences] = usePrefs("preferences");
  const tweetCover = preferences?.tweetCover;
  const onRunwayChange = useCallback(
    (indexes: readonly number[]) => {
      const sources = new Set<string>();
      for (const index of indexes) {
        const item = items[index];
        if (!item) continue;
        const save = pool.get(item.id);
        if (!save) continue;
        const unit = pickPrimaryUnit(save, { theme, tweetCover });
        if (!unit) continue;
        const src = cardPreviewSource(save, unit);
        if (src) sources.add(withThumbWidth(src, CARD_LQIP_WIDTH));
      }
      retainPreviewRunway([...sources]);
    },
    [items, theme, tweetCover],
  );

  useEffect(() => () => retainPreviewRunway([]), []);

  return (
    <PackedGrid
      layout={layout}
      items={items}
      totalHeight={totalHeight}
      onEndReached={onEndReached}
      onRunwayChange={onRunwayChange}
      renderItem={(it) => (
        <SaveCard
          key={it.id}
          id={it.id}
          layout={layout as CardLayout}
          packedWidth={it.width}
          packedHeight={it.height}
          packedTop={it.top}
          packedLeft={it.left}
        />
      )}
    />
  );
}
