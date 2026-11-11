import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import { protectSaves } from "@/features/saves/state/pool";

interface SelectionState {
  readonly ids: ReadonlySet<string>;
  readonly anchor: string | null;
  readonly cursor: string | null;
  readonly snapshot: ReadonlyArray<string>;
}

const initialSelection: SelectionState = {
  ids: new Set(),
  anchor: null,
  cursor: null,
  snapshot: [],
};

const selectionStore = new Store<SelectionState>(initialSelection);

function withIds(
  state: SelectionState,
  next: Set<string>,
  anchor: string | null = state.anchor,
): SelectionState {
  return {
    cursor: state.cursor,
    ids: next,
    anchor,
    snapshot: Array.from(next),
  };
}

function setSelection(ids: Iterable<string>): void {
  selectionStore.setState((s) => withIds(s, new Set(ids)));
}

function addToSelection(id: string): void {
  selectionStore.setState((s) => {
    if (s.ids.has(id)) return s;
    const next = new Set(s.ids);
    next.add(id);
    return withIds(s, next);
  });
}

function toggleSelection(id: string): void {
  selectionStore.setState((s) => {
    const next = new Set(s.ids);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return withIds(s, next);
  });
}

function clearSelection(): void {
  selectionStore.setState((s) => {
    if (s.ids.size === 0 && s.anchor === null && s.cursor === null) return s;
    return { ids: new Set(), anchor: null, cursor: null, snapshot: [] };
  });
}

function setSelectionAnchor(id: string): void {
  selectionStore.setState((s) => (s.anchor === id ? s : { ...s, anchor: id }));
}

function setSelectionRange(
  allIds: ReadonlyArray<string>,
  from: string,
  to: string,
): void {
  const fromIdx = allIds.indexOf(from);
  const toIdx = allIds.indexOf(to);
  if (fromIdx < 0 || toIdx < 0) return;
  const lo = Math.min(fromIdx, toIdx);
  const hi = Math.max(fromIdx, toIdx);
  selectionStore.setState((s) => withIds(s, new Set(allIds.slice(lo, hi + 1))));
}

export const selection = {
  getCursor(): string | null {
    return selectionStore.state.cursor;
  },
  setCursor(cursor: string | null): void {
    selectionStore.setState((s) =>
      s.cursor === cursor ? s : { ...s, cursor },
    );
  },
  snapshot(): ReadonlyArray<string> {
    return selectionStore.state.snapshot;
  },
  has(id: string): boolean {
    return selectionStore.state.ids.has(id);
  },
  size(): number {
    return selectionStore.state.ids.size;
  },
  set(ids: Iterable<string>): void {
    setSelection(ids);
  },
  add(id: string): void {
    addToSelection(id);
  },
  toggle(id: string): void {
    toggleSelection(id);
  },
  clear(): void {
    clearSelection();
  },
  setAnchor(id: string): void {
    setSelectionAnchor(id);
  },
  getAnchor(): string | null {
    return selectionStore.state.anchor;
  },
  setRange(allIds: ReadonlyArray<string>, from: string, to: string): void {
    setSelectionRange(allIds, from, to);
  },
};

export function useSelectedIds(): readonly string[] {
  return useSelector(selectionStore, (s) => s.snapshot);
}

export function useSelectionSize(): number {
  return useSelector(selectionStore, (s) => s.ids.size);
}
export function useSelectionCursor(): string | null {
  return useSelector(selectionStore, (s) => s.cursor);
}
export function useIsCursor(id: string): boolean {
  return useSelector(selectionStore, (s) => s.cursor === id);
}
export function useIsSelected(id: string): boolean {
  return useSelector(selectionStore, (s) => s.ids.has(id));
}

interface PrimaryState {
  readonly id: string | null;
}

export const primarySelectionStore = new Store<PrimaryState>({ id: null });

export const primarySelection = {
  get(): string | null {
    return primarySelectionStore.state.id;
  },
  set(next: string | null): void {
    primarySelectionStore.setState((s) => (s.id === next ? s : { id: next }));
  },
};

export function usePrimarySelection(): string | null {
  return useSelector(primarySelectionStore, (s) => s.id);
}

export function useIsPrimary(id: string): boolean {
  return useSelector(primarySelectionStore, (s) => s.id === id);
}

protectSaves(() => {
  const { ids, anchor, cursor } = selectionStore.state;
  return [...ids, anchor, cursor, primarySelectionStore.state.id];
});
