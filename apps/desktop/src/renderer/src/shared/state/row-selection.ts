import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

interface RowSelectionState<T> {
  readonly rows: ReadonlyArray<T>;
}

export interface RowSelectionStore<T> {
  snapshot(): ReadonlyArray<T>;
  size(): number;
  set(rows: ReadonlyArray<T>): void;
  clear(): void;
  subscribe(fn: () => void): () => void;
}

export function createRowSelectionStore<T>(
  sameRow: (a: T, b: T) => boolean,
): RowSelectionStore<T> & {
  useSize(): number;
  useRows(): ReadonlyArray<T>;
} {
  const store = new Store<RowSelectionState<T>>({ rows: [] });

  function sameRows(a: ReadonlyArray<T>, b: ReadonlyArray<T>): boolean {
    if (a.length !== b.length) {
      return false;
    }
    return a.every((row, i) => {
      const other = b[i];
      return other !== undefined && sameRow(row, other);
    });
  }

  const api: RowSelectionStore<T> = {
    snapshot(): ReadonlyArray<T> {
      return store.state.rows;
    },
    size(): number {
      return store.state.rows.length;
    },
    set(rows: ReadonlyArray<T>): void {
      store.setState((s) => (sameRows(s.rows, rows) ? s : { rows }));
    },
    clear(): void {
      store.setState((s) => (s.rows.length === 0 ? s : { rows: [] }));
    },
    subscribe(fn: () => void): () => void {
      const sub = store.subscribe(fn);
      return () => sub.unsubscribe();
    },
  };

  return {
    ...api,
    useSize(): number {
      return useSelector(store, (s) => s.rows.length);
    },
    useRows(): ReadonlyArray<T> {
      return useSelector(store, (s) => s.rows);
    },
  };
}
