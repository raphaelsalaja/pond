import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

/**
 * The user-driven half of the dock pill's state ("nav" is resting); the rendered DockView also accounts for the selection and ask stores, which take priority.
 * @remarks Lives in a store so surfaces outside the dock, like the application menu, can open a view without threading callbacks.
 */
export type DockMode =
  | "nav"
  | "ask"
  | "ask-history"
  | "search"
  | "search-help"
  | "layout"
  | "zoom"
  | "sort"
  | "sort-date"
  | "sort-content"
  | "sort-media"
  | "sort-file"
  | "display"
  | "connect-source"
  | "connect-help"
  | "connect-wait"
  | "watch-source"
  | "watch-help"
  | "watch-kind"
  | "watch-target"
  | "account-detail"
  | "account-profile"
  | "account-sync"
  | "account-maintenance"
  | "watch-detail"
  | "sync-frequency"
  | "source-new"
  | "analytics-range"
  | "analytics-rename"
  | "analytics-duplicate"
  | "confirm"
  | "selection-run"
  | "selection-tag"
  | "selection-copy"
  | "selection-export";

const store = new Store<{ mode: DockMode }>({ mode: "nav" });

export const dockMode = {
  current(): DockMode {
    return store.state.mode;
  },
  open(mode: Exclude<DockMode, "nav">): void {
    store.setState((s) => (s.mode === mode ? s : { mode }));
  },
  close(): void {
    store.setState((s) => (s.mode === "nav" ? s : { mode: "nav" }));
  },
  /** For module-level listeners; components should use useDockMode instead. */
  subscribe(fn: (mode: DockMode) => void): () => void {
    const sub = store.subscribe(() => fn(store.state.mode));
    return () => sub.unsubscribe();
  },
};

export function useDockMode(): DockMode {
  return useSelector(store, (s) => s.mode);
}
