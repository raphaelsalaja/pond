import { IconCircleWarning } from "@pond/icons";
import type { Save } from "@/features/saves/types";
import styles from "./styles.module.css";

export function FailedBadge({ save }: { save: Save }) {
  if (save.status !== "failed") return null;
  const lastError =
    save.tasks?.find((t) => t.status === "dead" || t.status === "blocked")
      ?.lastError ?? "Failed";
  return (
    <span
      className={styles.indicator}
      role="status"
      aria-label="Ingest failed"
      title={lastError}
    >
      <IconCircleWarning size={12} />
    </span>
  );
}
