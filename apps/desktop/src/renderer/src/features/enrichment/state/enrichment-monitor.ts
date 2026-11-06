import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";

export interface EnrichmentFailure {
  key: string;
  saveId: string;
  title: string | null;
  task: string;
  reason: string;
}

export interface MissingOriginal {
  id: string;
  title: string | null;
}

interface EnrichmentStatus {
  inflight: number;
  activeKeys: ReadonlySet<string>;
  failedKeys: ReadonlySet<string>;
  failures: readonly EnrichmentFailure[];
  missingOriginals: readonly MissingOriginal[];
}

const store = new Store<EnrichmentStatus>({
  inflight: 0,
  activeKeys: new Set<string>(),
  failedKeys: new Set<string>(),
  failures: [],
  missingOriginals: [],
});

export const enrichmentMonitor = {
  snapshot: () => store.state,
  subscribe: (listener: () => void) => store.subscribe(listener),
  set(patch: Partial<EnrichmentStatus>): void {
    store.setState((s) => ({ ...s, ...patch }));
  },
};

export function useEnrichmentStatus() {
  return useSelector(store, (state) => state);
}
