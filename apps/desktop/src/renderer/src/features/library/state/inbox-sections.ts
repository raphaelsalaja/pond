import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

/** Inbox sections folded shut, by heading; they stay folded across Group By changes for this session. */
const store = new Store<{ collapsed: ReadonlySet<string> }>({
  collapsed: new Set<string>(),
});

export const inboxSections = {
  toggle(section: string): void {
    store.setState(({ collapsed }) => {
      const next = new Set(collapsed);
      if (!next.delete(section)) next.add(section);
      return { collapsed: next };
    });
  },
};

export function useCollapsedInboxSections(): ReadonlySet<string> {
  return useSelector(store, (state) => state.collapsed);
}
