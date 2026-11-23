import { Button, Settings } from "@pond/ui";
import { useReducedMotion } from "motion/react";
import { formatBytes } from "@/shared/lib/format";
import { sectionForCategory } from "../lib/sections";
import {
  type Breakdown,
  type StorageSegment,
  storageSegments,
} from "./storage-segments";
import styles from "./styles.module.css";

function Entry({ segment }: { segment: StorageSegment }) {
  return (
    <>
      <span className={styles.swatch} data-category={segment.key} />
      <span>{segment.label}</span>
      <span className={styles.size}>
        {formatBytes(segment.bytes)} ·{" "}
        {segment.percent > 0 && segment.percent < 1
          ? "<1"
          : Math.round(segment.percent)}
        %
      </span>
    </>
  );
}

export function StorageBreakdown({ breakdown }: { breakdown: Breakdown }) {
  const reduceMotion = useReducedMotion();
  const segments = storageSegments(breakdown);
  if (!segments.length) return null;

  function reveal(id: string) {
    document.getElementById(id)?.scrollIntoView({
      block: "start",
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }

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
          {segments.map((segment) => {
            const target = sectionForCategory(segment.key);
            return (
              <li key={segment.key} className={styles.entry}>
                {target ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    rounding="rounded"
                    width="full"
                    className={styles.link}
                    onClick={() => reveal(target)}
                  >
                    <Entry segment={segment} />
                  </Button>
                ) : (
                  <span className={styles.static}>
                    <Entry segment={segment} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </Settings.Item>
  );
}
