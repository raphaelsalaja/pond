import { useMemo } from "react";
import { useStatusFeed } from "@/features/downloads/status-feed";
import { useEnrichmentStatus } from "@/features/enrichment/status";
import { useHealthSignal } from "@/features/settings/library-health";
import { formatNumber, formatPlural } from "@/shared/lib/format";

export interface InboxProgress {
  id: string;
  title: string;
  detail?: string | undefined;
}

const SAVES = { one: "Save", other: "Saves" };

/** Work still running in this window, pinned above the Inbox list until it settles. */
export function useInboxProgress(): InboxProgress[] {
  const entries = useStatusFeed();
  const { inflight } = useEnrichmentStatus();
  const { checking } = useHealthSignal();
  const processed = checking?.processed ?? 0;
  const total = checking ? checking.total : null;

  return useMemo(() => {
    const rows: InboxProgress[] = [];
    if (total !== null)
      rows.push({
        id: "progress:library-check",
        title: "Checking Library",
        detail:
          total > 0
            ? `${formatNumber(processed)} of ${formatPlural(total, SAVES)}`
            : undefined,
      });
    if (inflight > 0)
      rows.push({
        id: "progress:processing",
        title: "Processing Saves",
        detail: formatPlural(inflight, SAVES),
      });
    for (const entry of entries)
      rows.push({ id: `progress:activity:${entry.id}`, title: entry.label });
    return rows;
  }, [entries, inflight, processed, total]);
}
