import { Button } from "@pond/ui";
import type { DownloadActivity } from "@shared/download-activity";
import type { QueueSourceGate } from "@shared/queue-contracts";
import { type ReactNode, useEffect, useRef } from "react";
import { useClientHeight } from "@/shared/hooks/use-client-height";
import { type DownloadRow, mergeDownloadRows } from "../../../lib/status-feed";
import { DownloadTable } from "../table";
import styles from "./styles.module.css";

const PRE_MEASUREMENT_ROW_LIMIT = 50;

export interface DownloadsViewProps {
  rows: DownloadRow[];
  completed: DownloadRow[];
  activities: readonly DownloadActivity[];
  gates: readonly QueueSourceGate[];
  paused: boolean;
  historyLoading: boolean;
  historyError: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onRetryHistory: () => void;
  empty?: ReactNode;
}

function LoadMoreSentinel({
  loading,
  onLoadMore,
}: {
  loading: boolean;
  onLoadMore: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const load = useRef(onLoadMore);
  load.current = onLoadMore;
  useEffect(() => {
    const node = ref.current;
    if (!node || loading || !globalThis.IntersectionObserver) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) load.current();
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [loading]);
  return <div ref={ref} className={styles.sentinel} aria-hidden="true" />;
}

export function DownloadsView(props: DownloadsViewProps) {
  const rows = mergeDownloadRows(props.rows, props.completed);
  const { ref, height } = useClientHeight();
  const tableMeasured = height > 88;
  const tableRows = tableMeasured
    ? rows
    : rows.slice(0, PRE_MEASUREMENT_ROW_LIMIT);
  const extra = props.historyError ? (
    <div className={styles.message} role="alert">
      Couldn't load download history.
      <Button size="sm" variant="text" onClick={props.onRetryHistory}>
        Try Again
      </Button>
    </div>
  ) : props.hasMore ? (
    <LoadMoreSentinel
      loading={props.loadingMore}
      onLoadMore={props.onLoadMore}
    />
  ) : props.historyLoading && rows.length === 0 ? (
    <p className={styles.message} role="status">
      Loading download history
    </p>
  ) : null;
  if (rows.length === 0 && !extra) {
    return <div className={styles.content}>{props.empty}</div>;
  }
  return (
    <div className={styles.content}>
      <div ref={ref} className={styles.table}>
        <DownloadTable
          rows={tableRows}
          paused={props.paused}
          activities={props.activities}
          gates={props.gates}
          height={tableMeasured ? height - 40 : undefined}
          extra={extra}
        />
      </div>
    </div>
  );
}
