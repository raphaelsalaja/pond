import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import type { SaveListMode } from "@/features/saves/lib/list";

interface ViewContextState {
  readonly filteredIds: ReadonlyArray<string>;
  readonly mode: SaveListMode;
}

const store = new Store<ViewContextState>({
  filteredIds: [],
  mode: "library",
});

export const libraryViewContext = {
  filteredIds(): ReadonlyArray<string> {
    return store.state.filteredIds;
  },
  mode(): SaveListMode {
    return store.state.mode;
  },
  set(filteredIds: ReadonlyArray<string>, mode: SaveListMode): void {
    store.setState((s) =>
      s.filteredIds === filteredIds && s.mode === mode
        ? s
        : { filteredIds, mode },
    );
  },
};

export function useViewMode(): SaveListMode {
  return useSelector(store, (s) => s.mode);
}

export function useViewFilteredCount(): number {
  return useSelector(store, (s) => s.filteredIds.length);
}
