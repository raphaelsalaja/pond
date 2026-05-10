import type { Save } from "@/pool/types";
import { formatHms } from "./helpers";
import styles from "./styles.module.css";

export function VideoTimestamps({ save }: { save: Save }) {
  const stamps = save.annotations?.videoTimestamps ?? [];
  if (stamps.length === 0) return null;
  return (
    <div className={styles.actions}>
      <h3 className={styles["timestamps-title"]}>Timestamps</h3>
      <ul className={styles["timestamps-list"]}>
        {stamps.map((t) => (
          <li key={t.createdAt} className={styles["timestamps-item"]}>
            <span className={styles["timestamp-pos"]}>{formatHms(t.at)}</span>
            <span className={styles["timestamp-note"]}>{t.text ?? ""}</span>
            <button
              type="button"
              className={styles["timestamp-remove"]}
              onClick={async () => {
                const { removeVideoTimestamp } = await import(
                  "@/pool/annotations"
                );
                await removeVideoTimestamp(save, t.at);
              }}
              aria-label="Remove timestamp"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
