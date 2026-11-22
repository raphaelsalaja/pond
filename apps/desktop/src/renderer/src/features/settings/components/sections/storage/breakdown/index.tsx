import { Settings } from "@pond/ui";
import { formatBytes } from "@/shared/lib/format";
import { type Breakdown, storageSegments } from "./storage-segments";
import styles from "./styles.module.css";

export function StorageBreakdown({ breakdown }: { breakdown: Breakdown }) {
  const segments = storageSegments(breakdown);
  if (!segments.length) return null;
  return (
    <Settings.Item>
      <div className={styles.breakdown}>
        <div className={styles.bar} aria-hidden>
          {segments
            .filter((segment) => segment.bytes > 0)
            .map((segment) => (
              <span
                key={segment.key}
                className={styles.segment}
                data-category={segment.key}
                style={{ flexGrow: segment.percent }}
              />
            ))}
        </div>
        <ul className={styles.legend} aria-label="Library storage by category">
          {segments.map((segment) => (
            <li key={segment.key} className={styles.entry}>
              <span className={styles.swatch} data-category={segment.key} />
              <span>{segment.label}</span>
              <span className={styles.size}>
                {formatBytes(segment.bytes)} ·{" "}
                {segment.percent > 0 && segment.percent < 1
                  ? "<1"
                  : Math.round(segment.percent)}
                %
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Settings.Item>
  );
}
