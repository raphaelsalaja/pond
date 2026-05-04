import { useCallback, useEffect, useState } from "react";
import { Button, useToast } from "../../../ui";
import styles from "../styles.module.css";
import { SectionHeader, SectionStack, SettingsCard } from "./_shared";

/**
 * Indicator + reinstall affordance for the bundled CLI tools the
 * in-app refresh path shells out to. Without yt-dlp the auto-video
 * queue silently degrades to poster-only mode, so this card exists
 * to make that visible.
 */
export function VideoToolsSection() {
  const toast = useToast();
  const [status, setStatus] = useState<{
    ytdlp: { available: boolean; path: string | null };
    ffmpeg: { available: boolean; path: string | null };
  } | null>(null);
  const [reinstalling, setReinstalling] = useState(false);

  const refresh = useCallback(async () => {
    const r = await window.pond.videoToolsStatus().catch(() => null);
    if (!r?.ok) {
      setStatus(null);
      return;
    }
    setStatus({ ytdlp: r.ytdlp, ffmpeg: r.ffmpeg });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const reinstall = useCallback(async () => {
    setReinstalling(true);
    try {
      const r = await window.pond.videoToolsReinstall();
      toast.add({
        title: r.ok ? "yt-dlp ready" : "Couldn't install yt-dlp",
        description: r.message,
        type: r.ok ? "success" : "error",
      });
      await refresh();
    } finally {
      setReinstalling(false);
    }
  }, [refresh, toast]);

  return (
    <SectionStack>
      <SectionHeader
        title="Video tools"
        description="Bundled CLI tools that power background video downloads."
      />

      <SettingsCard>
        <p className={styles.cardLead}>
          Pond ships a bundled <code>yt-dlp</code> + <code>ffmpeg</code> so
          Refresh on a video card can save the actual MP4 alongside its poster.
          Without these, video saves stay still images.
        </p>
        {status ? (
          <ul className={styles.sourceList}>
            <li className={styles.sourceRow}>
              <div className={styles.sourceMeta}>
                <span className={styles.sourceName}>yt-dlp</span>
                <span
                  className={
                    status.ytdlp.available
                      ? styles.statusConnected
                      : styles.statusDisconnected
                  }
                >
                  {status.ytdlp.available ? "Installed" : "Missing"}
                </span>
              </div>
              <div className={styles.sourceActions}>
                <Button
                  size="sm"
                  disabled={reinstalling}
                  onClick={() => void reinstall()}
                >
                  {reinstalling
                    ? "Installing…"
                    : status.ytdlp.available
                      ? "Reinstall"
                      : "Install"}
                </Button>
              </div>
            </li>
            <li className={styles.sourceRow}>
              <div className={styles.sourceMeta}>
                <span className={styles.sourceName}>ffmpeg</span>
                <span
                  className={
                    status.ffmpeg.available
                      ? styles.statusConnected
                      : styles.statusDisconnected
                  }
                >
                  {status.ffmpeg.available ? "Installed" : "Missing"}
                </span>
              </div>
            </li>
          </ul>
        ) : (
          <p className={styles.cardLead}>
            Couldn't read tool status. Try restarting the app.
          </p>
        )}
      </SettingsCard>
    </SectionStack>
  );
}
