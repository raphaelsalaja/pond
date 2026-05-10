import { useCardContext } from "./context";
import styles from "./styles.module.css";

export function DownloadingBadge() {
  const { state } = useCardContext();
  if (!state.isDownloading) return null;
  return (
    <span
      className={styles.downloading}
      role="status"
      aria-label="Downloading video"
      title="Downloading video…"
    >
      <span className={styles["downloading-dot"]} aria-hidden="true" />
      Downloading
    </span>
  );
}
