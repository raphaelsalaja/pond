import { useMemo } from "react";
import { useStatusFeed } from "@/features/downloads/status-feed";
import { useHealthSignal } from "@/features/settings/library-health";
import { formatNumber, formatPlural } from "@/shared/lib/format";

export interface InboxProgress {
  id: string;
  title: string;
  detail?: string | undefined;
  about: string;
  startedAt?: number | undefined;
  /** Library Health shows this work in full. */
  health: boolean;
}

const SAVES = { one: "Save", other: "Saves" };

/** Work still running in this window, pinned above the Inbox list until it settles. */
export function useInboxProgress(): Array<InboxProgress> {
  const entries = useStatusFeed();
  const { checking } = useHealthSignal();
  const processed = checking?.processed ?? 0;
  const total = checking ? checking.total : null;

  return useMemo(() => {
    const rows: Array<InboxProgress> = [];
    if (total !== null) {
      rows.push({
        id: "progress:library-check",
        title: "Checking Library",
        detail:
          total > 0
            ? `${formatNumber(processed)} of ${formatPlural(total, SAVES)}`
            : undefined,
        about:
          "Pond checks files, previews, and the library index. Nothing changes until you choose a repair.",
        health: true,
      });
    }
    for (const entry of entries) {
      rows.push({
        id: `progress:activity:${entry.id}`,
        title: entry.label,
        about:
          "Running in this window. The result shows up in the Inbox when it's done.",
        startedAt: entry.startedAt,
        health: false,
      });
    }
    return rows;
  }, [entries, processed, total]);
}
