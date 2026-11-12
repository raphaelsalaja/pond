import type { Source } from "@pond/schema/db";
import type { TableColumn } from "@pond/ui/data-table";
import { BrandTile } from "@/features/sources/components/sync-monitor-source-tile";
import { formatNumber } from "@/shared/lib/format";
import { relativeTime } from "@/shared/lib/relative-time";
import type { SourceStatusId } from "../lib/filters";
import type { SourceTableRow } from "../lib/helpers";
import styles from "./styles.module.css";

const RING = 100;

function StatusGlyph({ status }: { status: SourceStatusId }) {
  return (
    <svg
      className={styles.glyph}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden
    >
      <title>{status}</title>
      <circle
        cx="8"
        cy="8"
        r="6"
        fill={status === "active" ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={status === "offline" ? "2 2.5" : undefined}
        opacity={status === "active" ? 1 : 0.45}
      />
      {status === "syncing" ? (
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray={`${0.65 * RING} ${RING}`}
          pathLength={RING}
          transform="rotate(-90 8 8)"
        />
      ) : null}
      {status === "active" ? (
        <path
          d="M5.2 8.2 7 10 10.8 6"
          fill="none"
          stroke="var(--ds-gray-1)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {status === "failed" ? (
        <path
          d="M5.6 5.6 10.4 10.4 M10.4 5.6 5.6 10.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      ) : null}
      {status === "paused" ? (
        <>
          <rect x="5.55" y="5.35" width="1.55" height="5.3" rx="0.4" />
          <rect x="8.9" y="5.35" width="1.55" height="5.3" rx="0.4" />
        </>
      ) : null}
    </svg>
  );
}

function StatusMark({ row }: { row: SourceTableRow }) {
  return (
    <span className={styles.status}>
      <span className={styles.mark} data-status={row.statusId}>
        <StatusGlyph status={row.statusId} />
      </span>
      <span className={styles.label}>{row.statusLabel}</span>
    </span>
  );
}

function SourceMark({
  source,
  label,
}: {
  source: Source | null;
  label: string;
}) {
  return (
    <span className={styles.source}>
      <BrandTile source={source ?? "local"} size={18} />
      <span className={styles.meta}>{label}</span>
    </span>
  );
}

export const sourcesColumns: TableColumn<SourceTableRow>[] = [
  {
    id: "name",
    header: "Name",
    sortLabel: "Name",
    accessor: (row) => row.name,
    width: "minmax(200px, 1fr)",
    reorderable: true,
    cell: (row) => (
      <span className={styles.name} title={row.name}>
        {row.name}
      </span>
    ),
  },
  {
    id: "items",
    header: "Items",
    sortLabel: "Items",
    accessor: (row) => row.items,
    width: "minmax(72px, 80px)",
    reorderable: true,
    cell: (row) => (
      <span className={styles.metric}>{formatNumber(row.items)}</span>
    ),
  },
  {
    id: "lastSynced",
    header: "Last Synced",
    sortLabel: "Last Synced",
    accessor: (row) => row.lastSyncedMs,
    width: "minmax(112px, 120px)",
    reorderable: true,
    cell: (row) => (
      <span className={styles.metric}>
        {row.lastSyncedAt ? relativeTime(row.lastSyncedAt) : "—"}
      </span>
    ),
  },
  {
    id: "status",
    header: "Status",
    sortLabel: "Status",
    accessor: (row) => row.statusLabel,
    width: "minmax(112px, 120px)",
    reorderable: true,
    cell: (row) => <StatusMark row={row} />,
  },
  {
    id: "source",
    header: "Source",
    sortLabel: "Source",
    accessor: (row) => row.sourceLabel,
    width: "minmax(128px, 140px)",
    reorderable: true,
    cell: (row) => <SourceMark source={row.source} label={row.sourceLabel} />,
  },
  {
    id: "type",
    header: "Type",
    sortLabel: "Type",
    accessor: (row) => row.kindLabel,
    width: "minmax(96px, 100px)",
    reorderable: true,
    cell: (row) => <span className={styles.meta}>{row.kindLabel}</span>,
  },
];
