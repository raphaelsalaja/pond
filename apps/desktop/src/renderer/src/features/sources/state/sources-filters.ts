import type { Source } from "@pond/schema/db";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import {
  defaultSourceFilters,
  sourceFiltersActive,
} from "@/features/sources/components/page/lib/filters";
import type {
  SourceFilters,
  SourceStatusId,
} from "@/features/sources/components/page/lib/filters";

const store = new Store<SourceFilters>(defaultSourceFilters());

export const sourcesFilters = {
  snapshot(): SourceFilters {
    return store.state;
  },
  setQ(q: string): void {
    store.setState((s) => (s.q === q ? s : { ...s, q }));
  },
  setStatuses(statuses: ReadonlySet<SourceStatusId>): void {
    store.setState((s) => ({ ...s, statuses }));
  },
  setSources(sources: ReadonlySet<Source>): void {
    store.setState((s) => ({ ...s, sources }));
  },
  setTypes(types: ReadonlySet<string>): void {
    store.setState((s) => ({ ...s, types }));
  },
  reset(): void {
    store.setState((s) =>
      s.q.trim() !== "" || sourceFiltersActive(s) ? defaultSourceFilters() : s,
    );
  },
  subscribe(fn: () => void): () => void {
    const sub = store.subscribe(fn);
    return () => sub.unsubscribe();
  },
};

export function useSourcesFilters(): SourceFilters {
  return useSelector(store, (s) => s);
}
