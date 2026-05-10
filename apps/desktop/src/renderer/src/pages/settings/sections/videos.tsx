import { Button, Select, Switch, useToast } from "@pond/ui";
import { useCallback, useEffect, useState } from "react";
import { Settings } from "@/components/settings";
import styles from "@/pages/settings/styles.module.css";
import {
  DEFAULT_VIDEO_DOWNLOAD,
  type SettingsRow,
  type VideoDownloadPrefs,
} from "./_types";

interface VideoToolsStatus {
  ytdlp: { available: boolean; path: string | null };
  ffmpeg: { available: boolean; path: string | null };
}

/**
 * Background video download tuning — toggle + max resolution + max
 * file size. The H.264-only codec policy stays intentionally hidden;
 * letting users opt into AV1 / VP9 here would route them straight
 * into Electron's missing-decoder failure mode.
 */
export function VideosSection() {
  const toast = useToast();
  const [settings, setSettings] = useState<SettingsRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [toolsStatus, setToolsStatus] = useState<VideoToolsStatus | null>(null);
  const [reinstalling, setReinstalling] = useState(false);

  useEffect(() => {
    void window.pond.query("settings.get", {}).then((s) => {
      const row = s as SettingsRow;
      setSettings({
        ...row,
        videoDownload: row.videoDownload ?? DEFAULT_VIDEO_DOWNLOAD,
      });
    });
  }, []);

  const refreshTools = useCallback(async () => {
    const r = await window.pond.videoToolsStatus().catch(() => null);
    if (!r?.ok) {
      setToolsStatus(null);
      return;
    }
    setToolsStatus({ ytdlp: r.ytdlp, ffmpeg: r.ffmpeg });
  }, []);

  useEffect(() => {
    void refreshTools();
  }, [refreshTools]);

  const reinstallTools = useCallback(async () => {
    setReinstalling(true);
    try {
      const r = await window.pond.videoToolsReinstall();
      toast.add({
        title: r.ok ? "yt-dlp ready" : "Couldn't install yt-dlp",
        description: r.message,
        type: r.ok ? "success" : "error",
      });
      await refreshTools();
    } finally {
      setReinstalling(false);
    }
  }, [refreshTools, toast]);

  async function patchVideoDownload(patch: Partial<VideoDownloadPrefs>) {
    if (!settings) return;
    const next = { ...settings.videoDownload, ...patch };
    setSettings({ ...settings, videoDownload: next });
    setBusy(true);
    try {
      const r = (await window.pond.query(
        "settings.setVideoDownload",
        patch,
      )) as { ok: true; videoDownload: VideoDownloadPrefs };
      setSettings((cur) =>
        cur ? { ...cur, videoDownload: r.videoDownload } : cur,
      );
    } catch (err) {
      toast.add({
        title: "Couldn't save preferences",
        description:
          err instanceof Error
            ? err.message
            : "Try again. If it keeps happening, check Developer › Open Log Directory.",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return (
      <Settings.Page>
        <Settings.Header>
          <Settings.Title>Videos</Settings.Title>
        </Settings.Header>
      </Settings.Page>
    );
  }

  const prefs = settings.videoDownload;
  const heightValue =
    prefs.maxHeight === null ? "any" : String(prefs.maxHeight);
  const sizeValue =
    prefs.maxFileSizeMb === null ? "any" : String(prefs.maxFileSizeMb);

  return (
    <Settings.Page>
      <Settings.Header>
        <Settings.Title>Videos</Settings.Title>
        <Settings.Description>
          How Pond downloads videos in the background.
        </Settings.Description>
      </Settings.Header>

      <Settings.Section>
        <Settings.SectionTitle>
          Background Video Downloads
        </Settings.SectionTitle>
        <Settings.List>
          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Download Videos</Settings.ItemTitle>
              <Settings.ItemDescription>
                Fetch the original MP4 from saves on X, Instagram, TikTok,
                Cosmos, and YouTube for offline playback.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Switch.Root
                checked={prefs.enabled}
                disabled={busy}
                onCheckedChange={(checked: boolean) =>
                  void patchVideoDownload({ enabled: checked })
                }
              />
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Maximum Resolution</Settings.ItemTitle>
              <Settings.ItemDescription>
                Higher resolutions mean crisper playback and bigger files. 1080p
                suits most clips.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Select.Root
                value={heightValue}
                disabled={busy || !prefs.enabled}
                onValueChange={(v) => {
                  if (v === null || v === "any") {
                    void patchVideoDownload({ maxHeight: null });
                    return;
                  }
                  void patchVideoDownload({
                    maxHeight: Number.parseInt(v, 10),
                  });
                }}
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="480">480p (Small Files)</Select.Item>
                  <Select.Item value="720">720p</Select.Item>
                  <Select.Item value="1080">1080p (Recommended)</Select.Item>
                  <Select.Item value="1440">1440p</Select.Item>
                  <Select.Item value="2160">2160p / 4K</Select.Item>
                  <Select.Item value="any">Original (No Cap)</Select.Item>
                </Select.Content>
              </Select.Root>
            </Settings.ItemControl>
          </Settings.Item>

          <Settings.Item>
            <Settings.ItemDetails>
              <Settings.ItemTitle>Maximum File Size</Settings.ItemTitle>
              <Settings.ItemDescription>
                Cap each download so a long stream can't fill the disk.
              </Settings.ItemDescription>
            </Settings.ItemDetails>
            <Settings.ItemControl>
              <Select.Root
                value={sizeValue}
                disabled={busy || !prefs.enabled}
                onValueChange={(v) => {
                  if (v === null || v === "any") {
                    void patchVideoDownload({ maxFileSizeMb: null });
                    return;
                  }
                  void patchVideoDownload({
                    maxFileSizeMb: Number.parseInt(v, 10),
                  });
                }}
              >
                <Select.Trigger>
                  <Select.Value />
                </Select.Trigger>
                <Select.Content>
                  <Select.Item value="200">{"200\u00A0MB"}</Select.Item>
                  <Select.Item value="500">
                    {"500\u00A0MB (Recommended)"}
                  </Select.Item>
                  <Select.Item value="1000">{"1\u00A0GB"}</Select.Item>
                  <Select.Item value="2000">{"2\u00A0GB"}</Select.Item>
                  <Select.Item value="5000">{"5\u00A0GB"}</Select.Item>
                  <Select.Item value="any">No Cap</Select.Item>
                </Select.Content>
              </Select.Root>
            </Settings.ItemControl>
          </Settings.Item>
        </Settings.List>
      </Settings.Section>

      <Settings.Section>
        <Settings.SectionTitle>Video Tools</Settings.SectionTitle>
        <Settings.ItemDescription>
          Bundled <code>yt-dlp</code> and <code>ffmpeg</code> let Refresh save
          the MP4 alongside its poster. Without them, video saves stay still
          images.
        </Settings.ItemDescription>
        {toolsStatus ? (
          <ul className={styles["source-list"]}>
            <li className={styles["source-row"]}>
              <div className={styles["source-meta"]}>
                <span className={styles["source-name"]}>yt-dlp</span>
                <span
                  className={
                    toolsStatus.ytdlp.available
                      ? styles["status-connected"]
                      : styles["status-disconnected"]
                  }
                >
                  {toolsStatus.ytdlp.available ? "Installed" : "Missing"}
                </span>
              </div>
              <div className={styles["source-actions"]}>
                <Button
                  size="sm"
                  disabled={reinstalling}
                  onClick={() => void reinstallTools()}
                >
                  {reinstalling
                    ? "Installing…"
                    : toolsStatus.ytdlp.available
                      ? "Reinstall"
                      : "Install"}
                </Button>
              </div>
            </li>
            <li className={styles["source-row"]}>
              <div className={styles["source-meta"]}>
                <span className={styles["source-name"]}>ffmpeg</span>
                <span
                  className={
                    toolsStatus.ffmpeg.available
                      ? styles["status-connected"]
                      : styles["status-disconnected"]
                  }
                >
                  {toolsStatus.ffmpeg.available ? "Installed" : "Missing"}
                </span>
              </div>
            </li>
          </ul>
        ) : (
          <Settings.ItemDescription>
            Couldn't read tool status. Restart Pond to retry.
          </Settings.ItemDescription>
        )}
      </Settings.Section>
    </Settings.Page>
  );
}
