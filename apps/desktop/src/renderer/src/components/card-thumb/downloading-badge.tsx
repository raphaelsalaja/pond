import { useCardContext } from "./context";
import styles from "./styles.module.css";

export function DownloadingBadge() {
  const { state } = useCardContext();
  const save = state.save;
  if (save.status === "failed") {
    const lastError =
      save.tasks?.find((t) => t.status === "failed")?.lastError ?? "Failed";
    return (
      <span
        className={styles.failed}
        role="status"
        aria-label="Ingest failed"
        title={lastError}
      >
        Failed
      </span>
    );
  }
  if (!state.isDownloading) return null;
  const fetchVideo = save.tasks?.find((t) => t.op === "fetch_video_ytdlp");
  const label = fetchVideo?.status === "running" ? "Downloading" : "Queued";
  return (
    <span
      className={styles.downloading}
      role="status"
      aria-label={`${label} video`}
      title={`${label} video…`}
    >
      <span className={styles["downloading-dot"]} aria-hidden="true" />
      {label}
    </span>
  );
}
