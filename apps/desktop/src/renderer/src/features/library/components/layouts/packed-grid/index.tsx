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
} from "@/features/library/components/layouts/grid";
import type { CardLayoutItem } from "@/features/library/components/layouts/packing";
import { useLibraryLayoutTransition } from "@/features/library/hooks/use-library-layout-transition";
import { SaveCard, useMultiSelectActive } from "@/features/saves";
import {
  resultNavigation,
  selection,
  useResultTotal,
  useSelectionCursor,
} from "@/features/saves/navigation";
import {
  recallScroll,
  recallScrollAnchor,
  rememberScroll,
  rememberScrollAnchor,
  type ScrollAnchor,
  ScrollRestorationContext,
} from "@/shared/hooks/use-scroll-restoration";
import { findScrollParent } from "@/shared/lib/dom";
import {
  buildVirtualBands,
  indicesForVirtualBands,
  PACKED_GRID_BAND_PX,
} from "./virtual-bands";

export type PackedItem = CardLayoutItem;

const END_THRESHOLD_ITEMS = 8;
const BAND_OVERSCAN = 3;
const RUNWAY_BANDS = 6;
const estimateBandSize = () => PACKED_GRID_BAND_PX;
const virtualBandKey = (index: number) => `packed-grid-band-${index}`;
const INITIAL_VIEWPORT_RECT = {
  width: "window" in globalThis ? window.innerWidth : 0,
  height: "window" in globalThis ? window.innerHeight : 1000,
};
const RESTORATION_SETTLE_MS = 750;
const MISSING_ANCHOR_TIMEOUT_MS = 5000;
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
  while (best > 0 && itemsByTop[best - 1]?.top === bestItem.top) best -= 1;
  const item = itemsByTop[best];
  if (!item) return null;
  return { item, offset: Math.max(0, localScrollTop - item.top) };
}

interface PackedGridProps {
  layout: GridLayout;
  items: PackedItem[];
  totalHeight: number;
  onEndReached?: () => void;
  renderItem: (item: PackedItem) => ReactNode;
  onRunwayChange?: (itemIndexes: readonly number[]) => void;
}

export function surroundingBandIndexes(
  mounted: readonly number[],
  count: number,
  runway = RUNWAY_BANDS,
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
  const cursor = useSelectionCursor();
  const activeId = items.some((item) => item.id === cursor)
    ? cursor
    : items[0]?.id;
  useLayoutEffect(() => resultNavigation.setLayout(items), [items]);
  useLayoutEffect(() => {
    if (
      document.activeElement === ref.current &&
      activeId &&
      cursor !== activeId
    )
      selection.setCursor(activeId);
  }, [activeId, cursor]);
  useLibraryLayoutTransition(ref, items);
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
      "ResizeObserver" in globalThis ? new ResizeObserver(measure) : null;
    observer?.observe(node);
    observer?.observe(parent);
    if (node.parentElement) observer?.observe(node.parentElement);
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [restoration]);

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
    return () => {
      if (restorationSettleTimer.current !== null) {
        clearTimeout(restorationSettleTimer.current);
        restorationSettleTimer.current = null;
      }
    };
  }, [getScrollElement, itemById, restoration, scrollMargin]);

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

  useLayoutEffect(
    () =>
      resultNavigation.registerReveal((id) => {
        const item = itemById.get(id);
        const parent = getScrollElement();
        if (!item || !parent) return;
        const top = scrollMargin + item.top;
        const bottom = top + item.height;
        if (top < parent.scrollTop) parent.scrollTop = top;
        else if (bottom > parent.scrollTop + parent.clientHeight)
          parent.scrollTop = Math.max(0, bottom - parent.clientHeight);
        if (resultNavigation.shouldFocus())
          ref.current?.focus({ preventScroll: true });
        resultNavigation.didReveal(id);
      }),
    [getScrollElement, itemById, scrollMargin],
  );

  const virtualizer = useVirtualizer({
    count: bands.length,
    getScrollElement,
    estimateSize: estimateBandSize,
    getItemKey: virtualBandKey,
    overscan: BAND_OVERSCAN,
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
  const mountedIndexes = useMemo(
    () => indicesForVirtualBands(bands, virtualBandIndexes),
    [bands, virtualBandIndexes],
  );
  const visible = useMemo(() => {
    const indexes = mountedIndexes;
    const activeIndex = items.findIndex((item) => item.id === activeId);
    return activeIndex >= 0 && !indexes.includes(activeIndex)
      ? [...indexes, activeIndex].sort((a, b) => a - b)
      : indexes;
  }, [activeId, items, mountedIndexes]);
  const runway = useMemo(() => {
    if (!onRunwayChange) return [];
    const mounted = new Set(visible);
    return indicesForVirtualBands(
      bands,
      surroundingBandIndexes(virtualBandIndexes, bands.length),
    ).filter((index) => !mounted.has(index));
  }, [bands, onRunwayChange, virtualBandIndexes, visible]);
  /** Cards subscribe to their own selection state, so a cursor move must not re-render every visible card. */
  const cards = useMemo(
    () => visible.map((i) => (items[i] ? renderItem(items[i]) : null)),
    [items, renderItem, visible],
  );
  const endReached = useRef(false);

  useEffect(() => {
    onRunwayChange?.(runway);
  }, [onRunwayChange, runway]);

  useEffect(() => {
    const nearEnd =
      (mountedIndexes.at(-1) ?? -1) >= items.length - END_THRESHOLD_ITEMS;
    if (!nearEnd) {
      endReached.current = false;
    } else if (!endReached.current && onEndReached) {
      endReached.current = true;
      onEndReached?.();
    }
  }, [mountedIndexes, items.length, onEndReached]);

  return (
    <LibraryGrid.Grid
      ref={ref}
      layout={layout}
      multiSelect={multiSelectActive}
      style={style}
      role="listbox"
      aria-label="Saves"
      aria-description="Arrow keys select Saves. Shift extends the selection. Option or Alt with arrows moves focus without changing selection; Shift+Space toggles the focused Save. Enter opens; Space previews."
      aria-multiselectable="true"
      aria-activedescendant={activeId ? `save-option-${activeId}` : undefined}
      data-save-collection=""
      tabIndex={0}
      onFocus={(event) => {
        if (event.target !== event.currentTarget) return;
        const cursor = selection.getCursor();
        const next = cursor && itemById.has(cursor) ? cursor : items[0]?.id;
        if (!next) return;
        if (cursor !== next) selection.setCursor(next);
        void resultNavigation.reveal(next);
      }}
      onKeyDown={(event) => {
        if (
          event.key !== "ContextMenu" &&
          !(event.shiftKey && event.key === "F10")
        )
          return;
        const option = activeId
          ? document.getElementById(`save-option-${activeId}`)
          : null;
        if (!option) return;
        event.preventDefault();
        const rect = option.getBoundingClientRect();
        option.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2,
          }),
        );
      }}
    >
      {cards}
    </LibraryGrid.Grid>
  );
}

interface SavePackedGridProps {
  layout: GridLayout;
  items: PackedItem[];
  totalHeight: number;
  onEndReached?: () => void;
}

export function SavePackedGrid({
  layout,
  items,
  totalHeight,
  onEndReached,
}: SavePackedGridProps) {
  const total = useResultTotal();
  const positions = useMemo(
    () => new Map(items.map((item, index) => [item.id, index + 1])),
    [items],
  );
  const setSize = Math.max(items.length, total);
  const renderItem = useCallback(
    (it: PackedItem) => (
      <SaveCard
        key={it.id}
        id={it.id}
        view={layout}
        position={positions.get(it.id)}
        total={setSize}
        slot={{
          width: it.width,
          height: it.height,
          previewHeight: it.mediaHeight,
          top: it.top,
          left: it.left,
        }}
      />
    ),
    [layout, positions, setSize],
  );
  return (
    <PackedGrid
      layout={layout}
      items={items}
      totalHeight={totalHeight}
      onEndReached={onEndReached}
      renderItem={renderItem}
    />
  );
}
