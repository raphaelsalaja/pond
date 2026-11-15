import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import type { LibraryNav } from "@/shared/lib/library-nav";

interface NavigationHistoryState {
  entries: LibraryNav[];
  index: number;
}

const store = new Store<NavigationHistoryState>({
  entries: [{ kind: "all" }],
  index: 0,
});

function sameNav(left: LibraryNav, right: LibraryNav): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "folder" && right.kind === "folder")
    return left.id === right.id;
  if (left.kind === "tag" && right.kind === "tag")
    return left.name === right.name;
  if (left.kind === "post" && right.kind === "post")
    return left.key === right.key;
  return true;
}

export const navigationHistory = {
  snapshot(): NavigationHistoryState {
    return store.state;
  },
  record(nav: LibraryNav): void {
    store.setState((state) => {
      const current = state.entries[state.index];
      if (current && sameNav(current, nav)) return state;
      const entries = [...state.entries.slice(0, state.index + 1), nav].slice(
        -50,
      );
      return { entries, index: entries.length - 1 };
    });
  },
  jump(index: number): LibraryNav | null {
    const nav = store.state.entries[index];
    if (!nav) return null;
    store.setState((state) => ({ ...state, index }));
    return nav;
  },
  back(): LibraryNav | null {
    return navigationHistory.jump(store.state.index - 1);
  },
  forward(): LibraryNav | null {
    return navigationHistory.jump(store.state.index + 1);
  },
  clear(): void {
    const current = store.state.entries[store.state.index] ?? { kind: "all" };
    store.setState(() => ({ entries: [current], index: 0 }));
  },
};

export function useNavigationHistory(): NavigationHistoryState {
  return useSelector(store, (state) => state);
}
