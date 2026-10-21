import { sourceLabel } from "@pond/schema/sources";
import { type RenderRowArgs, type TableColumn, Tooltip } from "@pond/ui";
import type { DownloadActivity } from "@shared/download-activity";
import { useDownloadClock } from "@/features/downloads/hooks/use-download-activity";
import type { DownloadRow } from "@/features/downloads/lib/status-feed";
import { BrandTile } from "@/features/sources";
import { relativeTimeFromMs } from "@/shared/lib/relative-time";
import {
  describeDownloadActivity,
  formatBytes,
  formatDuration,
} from "../../../lib/download-progress";
import { downloadBrandSource } from "../brand";
import { DownloadContextMenu } from "../context-menu";
import {
  type DownloadTableStatus,
  downloadStatusLabel,
  downloadTableStatus,
  isDownloadProcessing,
  isDownloadStopped,
} from "../status";
import styles from "./styles.module.css";

export interface DownloadViewRow extends DownloadRow {
  paused: boolean;
  activity?: DownloadActivity;
}

const RING = 100;

function measuredActivity(row: DownloadViewRow, now: number) {
  return row.status === "running" && row.activity?.state === "running"
    ? describeDownloadActivity(row.activity, now)
    : null;
}

function StatusGlyph({ status }: { status: DownloadTableStatus }) {
  const complete = status === "complete";
  const progress = status === "progress";
  const failed = status === "failed";
  const paused = status === "paused";
  const idle = status === "cancelled" || status === "skipped";
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
        fill={complete ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={idle ? "2 2.5" : undefined}
        opacity={complete ? 1 : 0.45}
      />
      {progress ? (
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
      {complete ? (
        <path
          d="M5.2 8.2 7 10 10.8 6"
          fill="none"
          stroke="var(--ds-gray-1)"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {failed ? (
        <path
          d="M5.6 5.6 10.4 10.4 M10.4 5.6 5.6 10.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
      ) : null}
      {paused ? (
        <>
          <rect x="5.55" y="5.35" width="1.55" height="5.3" rx="0.4" />
          <rect x="8.9" y="5.35" width="1.55" height="5.3" rx="0.4" />
        </>
      ) : null}
    </svg>
  );
}

function NameCell({ row }: { row: DownloadViewRow }) {
  const title = row.name.trim() || row.url.trim() || "Untitled save";
  return (
    <span className={styles.lead}>
      <span className={styles.name} title={title}>
        {title}
      </span>
    </span>
  );
}

function SourceCell({ row }: { row: DownloadViewRow }) {
  const source = downloadBrandSource(row.source, row.url);
  return (
    <span className={styles.source}>
      <BrandTile source={source} size={18} />
      <span className={styles["source-label"]}>{sourceLabel(source)}</span>
    </span>
  );
}

function StatusCell({ row }: { row: DownloadViewRow }) {
  const status = downloadTableStatus(row, row.paused);
  const label = downloadStatusLabel(row, row.paused);
  const reason = status === "failed" ? row.error?.trim() : undefined;
  const content = (
    <span className={styles.status}>
      <span className={styles.mark} data-status={status}>
        <StatusGlyph status={status} />
      </span>
      <span className={styles["status-label"]}>{label}</span>
    </span>
  );
  if (!reason) return content;
  return (
    <Tooltip label={reason} side="top">
      {content}
    </Tooltip>
  );
}

function ProgressRing({ value }: { value: number }) {
  return (
    <svg
      className={styles["progress-ring"]}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden
    >
      <circle
        className={styles["progress-ring-track"]}
        cx="8"
        cy="8"
        r="6"
        fill="none"
        strokeWidth="2"
      />
      <circle
        className={styles["progress-ring-value"]}
        cx="8"
        cy="8"
        r="6"
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${value * RING} ${RING}`}
        pathLength={RING}
        transform="rotate(-90 8 8)"
      />
    </svg>
  );
}

function ProgressCell({ row }: { row: DownloadViewRow }) {
  const running = row.status === "running";
  const now = useDownloadClock(running && row.activity?.state === "running");
  const measured = measuredActivity(row, now);
  const rawProgress =
    measured?.progress ??
    (running ? row.progress : row.status === "complete" ? 1 : 0) ??
    0;
  const progress = Math.max(0, Math.min(1, rawProgress));
  const percentage = Math.round(progress * 100);
  const title = row.name.trim() || row.url.trim() || "Untitled save";
  return (
    <span
      className={styles["progress-cell"]}
      role="progressbar"
      aria-label={`${title} transfer progress`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percentage}
    >
      <ProgressRing value={progress} />
      <span className={styles.metric}>{percentage}%</span>
    </span>
  );
}

function AddedCell({ row }: { row: DownloadViewRow }) {
  return (
    <span className={`${styles.metric} ${styles.added}`}>
      {relativeTimeFromMs(row.ts)}
    </span>
  );
}

function receivingTransfer(row: DownloadViewRow) {
  if (row.status !== "running" || row.activity?.state !== "running")
    return null;
  return (
    row.activity.transfers.find((transfer) => transfer.state === "receiving") ??
    null
  );
}

const EMPTY_METRIC = "—";

function MetricCell({ value }: { value: string }) {
  return <span className={styles.metric}>{value}</span>;
}

function SizeCell({ row }: { row: DownloadViewRow }) {
  const transfer = receivingTransfer(row);
  if (transfer?.receivedBytes == null)
    return <MetricCell value={EMPTY_METRIC} />;
  if (!transfer.totalBytes || transfer.totalBytes <= 0)
    return <MetricCell value={formatBytes(transfer.receivedBytes)} />;
  return (
    <MetricCell
      value={`${formatBytes(transfer.receivedBytes)} / ${formatBytes(transfer.totalBytes)}`}
    />
  );
}

function SpeedCell({ row }: { row: DownloadViewRow }) {
  const running = row.status === "running";
  const now = useDownloadClock(running && row.activity?.state === "running");
  return (
    <MetricCell value={measuredActivity(row, now)?.speed ?? EMPTY_METRIC} />
  );
}

function RemainingCell({ row }: { row: DownloadViewRow }) {
  const seconds = receivingTransfer(row)?.etaSeconds;
  return (
    <MetricCell
      value={
        seconds == null || !Number.isFinite(seconds)
          ? EMPTY_METRIC
          : formatDuration(seconds * 1_000)
      }
    />
  );
}

function elapsedMs(row: DownloadViewRow, now: number): number | null {
  if (row.status === "running" && row.activity?.state === "running")
    return Math.max(0, now - row.activity.startedAt);
  if (row.durationMs != null && row.durationMs >= 0) return row.durationMs;
  return null;
}

function ElapsedCell({ row }: { row: DownloadViewRow }) {
  const running = row.status === "running" && row.activity?.state === "running";
  const now = useDownloadClock(Boolean(running));
  const ms = elapsedMs(row, now);
  return <MetricCell value={ms == null ? EMPTY_METRIC : formatDuration(ms)} />;
}

function activeTransfer(row: DownloadViewRow) {
  const transfers = row.activity?.transfers ?? [];
  return (
    transfers.find((transfer) => transfer.state === "receiving") ??
    transfers.find((transfer) => transfer.state === "requesting") ??
    transfers[0] ??
    null
  );
}

function FilesCell({ row }: { row: DownloadViewRow }) {
  const transfer = activeTransfer(row);
  if (!transfer) return <MetricCell value={EMPTY_METRIC} />;
  if (transfer.fileCount && transfer.fileCount > 1)
    return (
      <MetricCell value={`${transfer.fileIndex} of ${transfer.fileCount}`} />
    );
  return <MetricCell value="1" />;
}

function AttemptsCell({ row }: { row: DownloadViewRow }) {
  return (
    <MetricCell
      value={row.attempts > 0 ? String(row.attempts) : EMPTY_METRIC}
    />
  );
}

function serverHost(row: DownloadViewRow): string {
  const host = row.activity?.transfers.find(
    (transfer) => transfer.request?.host,
  )?.request?.host;
  if (host) return host;
  try {
    return new URL(row.url).host;
  } catch {
    return "";
  }
}

function ServerCell({ row }: { row: DownloadViewRow }) {
  const host = serverHost(row);
  if (!host) return <MetricCell value={EMPTY_METRIC} />;
  return (
    <span className={`${styles.metric} ${styles.added}`} title={host}>
      {host}
    </span>
  );
}

function ErrorCell({ row }: { row: DownloadViewRow }) {
  const error = row.error?.trim() ?? "";
  if (!error) return <MetricCell value={EMPTY_METRIC} />;
  return (
    <span className={`${styles.metric} ${styles.added}`} title={error}>
      {error}
    </span>
  );
}

export const downloadsColumns: TableColumn<DownloadViewRow>[] = [
  {
    id: "name",
    header: "Name",
    sortLabel: "Name",
    accessor: (row) => row.name,
    width: "minmax(160px, 1.6fr)",
    reorderable: true,
    cell: (row) => <NameCell row={row} />,
  },
  {
    id: "source",
    header: "Source",
    sortLabel: "Source",
    accessor: (row) => sourceLabel(downloadBrandSource(row.source, row.url)),
    width: "140px",
    reorderable: true,
    cell: (row) => <SourceCell row={row} />,
  },
  {
    id: "stage",
    header: "Status",
    sortLabel: "Status",
    accessor: (row) => downloadStatusLabel(row, row.paused),
    width: "minmax(140px, 1fr)",
    reorderable: true,
    cell: (row) => <StatusCell row={row} />,
  },
  {
    id: "size",
    header: "Size",
    sortLabel: "Size",
    sort: "number",
    accessor: (row) => receivingTransfer(row)?.receivedBytes ?? -1,
    width: "156px",
    reorderable: true,
    cell: (row) => <SizeCell row={row} />,
  },
  {
    id: "speed",
    header: "Speed",
    sortLabel: "Speed",
    sort: "number",
    accessor: (row) => receivingTransfer(row)?.bytesPerSecond ?? -1,
    width: "104px",
    reorderable: true,
    cell: (row) => <SpeedCell row={row} />,
  },
  {
    id: "remaining",
    header: "Remaining",
    sortLabel: "Remaining",
    sort: "number",
    accessor: (row) =>
      receivingTransfer(row)?.etaSeconds ?? Number.POSITIVE_INFINITY,
    width: "112px",
    reorderable: true,
    cell: (row) => <RemainingCell row={row} />,
  },
  {
    id: "progress",
    header: "Progress",
    sortLabel: "Progress",
    sort: "number",
    accessor: (row) =>
      measuredActivity(row, Date.now())?.progress ?? row.progress ?? -1,
    width: "96px",
    reorderable: true,
    cell: (row) => <ProgressCell row={row} />,
  },
  {
    id: "elapsed",
    header: "Elapsed",
    sortLabel: "Elapsed",
    sort: "number",
    accessor: (row) => elapsedMs(row, Date.now()) ?? -1,
    width: "96px",
    reorderable: true,
    cell: (row) => <ElapsedCell row={row} />,
  },
  {
    id: "files",
    header: "Files",
    sortLabel: "Files",
    sort: "number",
    accessor: (row) => activeTransfer(row)?.fileCount ?? -1,
    width: "88px",
    reorderable: true,
    cell: (row) => <FilesCell row={row} />,
  },
  {
    id: "attempts",
    header: "Attempts",
    sortLabel: "Attempts",
    sort: "number",
    accessor: (row) => row.attempts,
    width: "96px",
    reorderable: true,
    cell: (row) => <AttemptsCell row={row} />,
  },
  {
    id: "server",
    header: "Server",
    sortLabel: "Server",
    accessor: (row) => serverHost(row),
    width: "148px",
    reorderable: true,
    cell: (row) => <ServerCell row={row} />,
  },
  {
    id: "error",
    header: "Error",
    sortLabel: "Error",
    accessor: (row) => row.error ?? "",
    width: "minmax(160px, 1.2fr)",
    reorderable: true,
    cell: (row) => <ErrorCell row={row} />,
  },
  {
    id: "added",
    header: "Added",
    sortLabel: "Added",
    sort: "number",
    accessor: (row) => row.ts,
    width: "120px",
    reorderable: true,
    cell: (row) => <AddedCell row={row} />,
  },
];

export function DownloadQueueRow({
  row,
  rowProps,
  cells,
}: RenderRowArgs<DownloadViewRow>) {
  const running = row.status === "running";
  const now = useDownloadClock(running && row.activity?.state === "running");
  const measured = measuredActivity(row, now);
  return (
    <DownloadContextMenu row={row}>
      <div
        {...rowProps}
        className={`${rowProps.className} ${styles.row}`}
        data-status={row.status}
        data-stalled={measured?.stalled || undefined}
        data-moving={running || undefined}
        data-processing={isDownloadProcessing(row) || undefined}
        data-paused={isDownloadStopped(row, row.paused) || undefined}
      >
        {cells}
      </div>
    </DownloadContextMenu>
  );
}
