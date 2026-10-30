import { Store } from "@tanstack/store";
import type { Save } from "@/features/saves/types";

interface SavesState {
  readonly byId: Map<string, Save>;
  readonly sorted: ReadonlyArray<Save>;
  readonly revision: number;
}

function savedAtMs(save: Save): number {
  return Number.isFinite(save.savedAt) ? save.savedAt : 0;
}

function sortByRecency(list: Iterable<Save>): Save[] {
  return Array.from(list).sort((a, b) => savedAtMs(b) - savedAtMs(a));
}

function isRecencyDesc(list: ReadonlyArray<Save>): boolean {
  for (let i = 1; i < list.length; i++) {
    const prev = list[i - 1];
    const cur = list[i];
    if (!prev || !cur) continue;
    if (savedAtMs(prev) < savedAtMs(cur)) return false;
  }
  return true;
}

function canSkipFullSort(
  list: ReadonlyArray<Save>,
  byId: Map<string, Save>,
  sorted: ReadonlyArray<Save>,
): boolean {
  if (!isRecencyDesc(list)) return false;
  const headMs = sorted[0] ? savedAtMs(sorted[0]) : Number.NEGATIVE_INFINITY;
  for (const save of list) {
    const prev = byId.get(save.id);
    if (prev) {
      if (savedAtMs(prev) !== savedAtMs(save)) return false;
    } else if (savedAtMs(save) <= headMs) {
      // New ties must follow existing Saves, as in single-upsert's stable sort.
      return false;
    }
  }
  return true;
}

function sortedAfterSkip(
  list: ReadonlyArray<Save>,
  byId: Map<string, Save>,
  sorted: ReadonlyArray<Save>,
): Save[] {
  const updated = new Map<string, Save>();
  const prepend: Save[] = [];
  for (const save of list) {
    if (byId.has(save.id)) updated.set(save.id, save);
    else prepend.push(save);
  }
  const nextSorted =
    updated.size === 0
      ? sorted
      : sorted.map((row) => updated.get(row.id) ?? row);
  if (prepend.length === 0) {
    return updated.size === 0 ? [...sorted] : [...nextSorted];
  }
  return [...prepend, ...nextSorted];
}

export const savesStore = new Store<SavesState>({
  byId: new Map(),
  sorted: [],
  revision: 0,
});

type DirtyListener = (ids: readonly string[]) => void;
const dirtyListeners = new Set<DirtyListener>();

export function onPoolDirty(listener: DirtyListener): () => void {
  dirtyListeners.add(listener);
  return () => {
    dirtyListeners.delete(listener);
  };
}

function emitDirty(ids: readonly string[]): void {
  if (ids.length === 0 || dirtyListeners.size === 0) return;
  for (const listener of dirtyListeners) listener(ids);
}

export const pool = {
  get(id: string): Save | undefined {
    return savesStore.state.byId.get(id);
  },
  ids(): IterableIterator<string> {
    return savesStore.state.byId.keys();
  },
  snapshot(): ReadonlyArray<Save> {
    return savesStore.state.sorted;
  },
  upsert(save: Save): void {
    upsertSave(save);
  },
  bulkUpsert(list: ReadonlyArray<Save>): void {
    bulkUpsertSaves(list);
  },
  delete(id: string): void {
    deleteSave(id);
  },
  bulkDelete(ids: readonly string[]): void {
    const present = new Set(ids.filter((id) => savesStore.state.byId.has(id)));
    if (present.size === 0) return;
    savesStore.setState((s) => {
      for (const id of present) s.byId.delete(id);
      return {
        byId: s.byId,
        sorted: s.sorted.filter((save) => !present.has(save.id)),
        revision: s.revision + 1,
      };
    });
    emitDirty([...present]);
  },
  clear(): void {
    clearSaves();
  },
};

export function upsertSave(save: Save): void {
  let dirty = false;
  savesStore.setState((s) => {
    const prev = s.byId.get(save.id);
    if (prev === save) return s;
    dirty = true;
    s.byId.set(save.id, save);
    const sorted =
      prev && savedAtMs(prev) === savedAtMs(save)
        ? s.sorted.map((row) => (row.id === save.id ? save : row))
        : sortByRecency(s.byId.values());
    return { byId: s.byId, sorted, revision: s.revision + 1 };
  });
  if (dirty) emitDirty([save.id]);
}

export function bulkUpsertSaves(list: ReadonlyArray<Save>): void {
  if (list.length === 0) return;
  savesStore.setState((s) => {
    const skipSort = canSkipFullSort(list, s.byId, s.sorted);
    const sorted = skipSort ? sortedAfterSkip(list, s.byId, s.sorted) : null;
    for (const save of list) s.byId.set(save.id, save);
    return {
      byId: s.byId,
      sorted: sorted ?? sortByRecency(s.byId.values()),
      revision: s.revision + 1,
    };
  });
  emitDirty(list.map((s) => s.id));
}

export function deleteSave(id: string): void {
  let dirty = false;
  savesStore.setState((s) => {
    if (!s.byId.has(id)) return s;
    dirty = true;
    s.byId.delete(id);
    return {
      byId: s.byId,
      sorted: s.sorted.filter((row) => row.id !== id),
      revision: s.revision + 1,
    };
  });
  if (dirty) emitDirty([id]);
}

function clearSaves(): void {
  savesStore.setState((s) =>
    s.byId.size === 0
      ? s
      : { byId: new Map(), sorted: [], revision: s.revision + 1 },
  );
}

export function patchSaveRawJson(id: string, rawJson: Save["rawJson"]): void {
  savesStore.setState((s) => {
    const prev = s.byId.get(id);
    if (!prev) return s;
    s.byId.set(id, { ...prev, rawJson });
    return { byId: s.byId, sorted: s.sorted, revision: s.revision + 1 };
  });
}
