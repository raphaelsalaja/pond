import { useCallback, useSyncExternalStore } from "react";
import {
  intersectingResults,
  type ResultDirection,
  type ResultRectangle,
  spatialNeighbor,
} from "@/features/saves/lib/spatial-navigation";
import { protectSaves } from "@/features/saves/state/pool";

interface ResultSource {
  key?: string;
  loadedIds?: () => readonly string[];
  ids: readonly string[];
  allIds?: () => Promise<string[] | null>;
  loadMore?: () => Promise<void>;
  total?: number;
}

const subscribers = new Set<() => void>();
const subscribe = (listener: () => void) => {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
};

let source: ResultSource = { ids: [] };
let reveal: ((id: string) => void) | null = null;
let pendingReveal: string | null = null;
let focusOnReveal = false;
let focusOwner: Element | null = null;
let rectangles: readonly ResultRectangle[] = [];

/** `loadedIds` reads the live query page, so results stay protected before the view republishes them. */
protectSaves(() => [...source.ids, ...(source.loadedIds?.() ?? [])]);

export const resultNavigation = {
  key(): string | undefined {
    return source.key;
  },
  total(): number {
    return source.total ?? source.ids.length;
  },
  indexOf(id: string): number {
    return source.ids.indexOf(id);
  },
  setLayout(items: readonly ResultRectangle[]): () => void {
    rectangles = items;
    return () => {
      if (rectangles === items) rectangles = [];
    };
  },
  neighbor(
    id: string,
    direction: ResultDirection,
    pageHeight: number,
  ): string | null {
    return spatialNeighbor(rectangles, id, direction, pageHeight);
  },
  intersecting(rectangle: Omit<ResultRectangle, "id">): string[] {
    return intersectingResults(rectangles, rectangle);
  },
  async loadNextPage(): Promise<boolean> {
    const previous = (source.loadedIds?.() ?? source.ids).length;
    await source.loadMore?.();
    return (source.loadedIds?.() ?? source.ids).length > previous;
  },
  shouldFocus(): boolean {
    if (!focusOnReveal || !("document" in globalThis)) return false;
    const active = document.activeElement;
    return (
      active === focusOwner ||
      (active === document.body && !focusOwner?.isConnected)
    );
  },
  setSource(next: ResultSource): void {
    if (source.key !== next.key) {
      pendingReveal = null;
      focusOnReveal = false;
    }
    source = next;
    for (const listener of subscribers) listener();
    if (pendingReveal && source.ids.includes(pendingReveal))
      reveal?.(pendingReveal);
  },
  async ids(): Promise<readonly string[]> {
    return (await source.allIds?.()) ?? source.ids;
  },
  async next(id: string, delta: number): Promise<string | null> {
    const loadedIndex = source.ids.indexOf(id);
    const loaded =
      loadedIndex >= 0 ? source.ids[loadedIndex + delta] : undefined;
    if (loaded) return loaded;
    const ids = await this.ids();
    const index = ids.indexOf(id);
    return index < 0 ? null : (ids[index + delta] ?? null);
  },
  registerReveal(callback: (id: string) => void): () => void {
    reveal = callback;
    if (pendingReveal) callback(pendingReveal);
    return () => {
      if (reveal === callback) reveal = null;
    };
  },
  async reveal(id: string, options: { focus?: boolean } = {}): Promise<void> {
    pendingReveal = id;
    focusOnReveal = options.focus ?? false;
    focusOwner = "document" in globalThis ? document.activeElement : null;
    const key = source.key;
    while (
      !(source.loadedIds?.() ?? source.ids).includes(id) &&
      source.loadMore
    ) {
      const previous = (source.loadedIds?.() ?? source.ids).length;
      await source.loadMore();
      if (source.key !== key || pendingReveal !== id) return;
      if ((source.loadedIds?.() ?? source.ids).length <= previous) break;
    }
    if (source.key === key) reveal?.(id);
  },
  didReveal(id: string): void {
    if (pendingReveal === id) {
      pendingReveal = null;
      focusOnReveal = false;
    }
  },
  /** Reports the nearest remaining neighbor, or null, once `id` drops out of results that held it. */
  watchDeparture(
    id: string,
    onLeave: (next: string | null) => void,
  ): () => void {
    let held = source.ids.includes(id) ? source : null;
    const check = () => {
      if (source.ids.includes(id)) {
        held = source;
        return;
      }
      const before = held;
      held = null;
      if (!before || before.key !== source.key) return;
      const remaining = new Set(source.ids);
      const index = before.ids.indexOf(id);
      onLeave(
        before.ids.slice(index + 1).find((other) => remaining.has(other)) ??
          before.ids
            .slice(0, index)
            .findLast((other) => remaining.has(other)) ??
          source.ids[Math.min(index, source.ids.length - 1)] ??
          null,
      );
    };
    return subscribe(check);
  },
};

export function useResultTotal(): number {
  return useSyncExternalStore(subscribe, resultNavigation.total);
}

export function useResultIndex(id: string): number {
  const getSnapshot = useCallback(() => resultNavigation.indexOf(id), [id]);
  return useSyncExternalStore(subscribe, getSnapshot);
}
