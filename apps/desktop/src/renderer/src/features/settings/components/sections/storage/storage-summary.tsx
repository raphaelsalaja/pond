import { Button, Settings } from "@pond/ui";
import { useQuery } from "@tanstack/react-query";
import { formatBytes } from "@/shared/lib/format";
import { storageSegments } from "./storage-segments";
import styles from "./styles.module.css";

export const STORAGE_SNAPSHOT_KEY = ["storage-snapshot"] as const;

export function useStorageSnapshot() {
  return useQuery({
    queryKey: STORAGE_SNAPSHOT_KEY,
    queryFn: () => window.pond.query("storage.snapshot", {}),
    refetchInterval: 60_000,
  });
}

export function StorageSummary() {
  const query = useStorageSnapshot();
  const data = query.data;
  const segments = data ? storageSegments(data.breakdown) : [];
  return (
    <Settings.List>
      <Settings.Item>
        <Settings.ItemDetails>
          <Settings.ItemTitle>Library Size</Settings.ItemTitle>
          <Settings.ItemDescription>
            {data
              ? `${formatBytes(data.pondBytes)} used · ${formatBytes(data.deviceFreeBytes)} available of ${formatBytes(data.deviceTotalBytes)} · Updated ${new Date(data.computedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
              : query.isError
                ? "Couldn't measure storage."
                : "Measuring storage"}
          </Settings.ItemDescription>
        </Settings.ItemDetails>
        <Settings.ItemControl>
          <Button
            size="sm"
            variant="secondary"
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh
          </Button>
        </Settings.ItemControl>
      </Settings.Item>
      {segments.length ? (
        <Settings.Item>
          <div className={styles.breakdown}>
            <div className={styles.bar} aria-hidden>
              {segments.map((segment) => (
                <span
                  key={segment.key}
                  className={styles.segment}
                  data-category={segment.key}
                  style={{ flexGrow: segment.percent }}
                />
              ))}
            </div>
            <ul
              className={styles.legend}
              aria-label="Library storage by category"
            >
              {segments.map((segment) => (
                <li key={segment.key} className={styles.entry}>
                  <span className={styles.swatch} data-category={segment.key} />
                  <span>{segment.label}</span>
                  <span className={styles.size}>
                    {formatBytes(segment.bytes)} ·{" "}
                    {segment.percent < 1 ? "<1" : Math.round(segment.percent)}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </Settings.Item>
      ) : null}
    </Settings.List>
  );
}
