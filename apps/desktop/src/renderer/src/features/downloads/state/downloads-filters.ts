import type { Source } from "@pond/schema/db";
import { useSelector } from "@tanstack/react-store";
import { Store } from "@tanstack/store";
import {
  defaultDownloadFilters,
  downloadFiltersActive,
} from "@/features/downloads/lib/status-feed/downloads";
import type {
  DownloadFilters,
  StatusFilter,
} from "@/features/downloads/lib/status-feed/downloads";

const store = new Store<DownloadFilters>(defaultDownloadFilters());

export const downloadsFilters = {
  snapshot(): DownloadFilters {
    return store.state;
  },
  setQ(q: string): void {
    store.setState((s) => (s.q === q ? s : { ...s, q }));
  },
  setStatuses(statuses: ReadonlySet<StatusFilter>): void {
    store.setState((s) => ({ ...s, statuses }));
  },
  setSources(sources: ReadonlySet<Source>): void {
    store.setState((s) => ({ ...s, sources }));
  },
  reset(): void {
    store.setState((s) =>
      s.q.trim() !== "" || downloadFiltersActive(s)
        ? defaultDownloadFilters()
        : s,
    );
  },
};

export function useDownloadsFilters(): DownloadFilters {
  return useSelector(store, (s) => s);
}
