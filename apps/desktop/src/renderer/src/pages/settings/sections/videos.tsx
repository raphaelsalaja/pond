import { useEffect, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  useToast,
} from "../../../ui";
import { Row, SectionHeader, SectionStack, SettingsCard } from "./_shared";
import {
  DEFAULT_VIDEO_DOWNLOAD,
  type SettingsRow,
  type VideoDownloadPrefs,
} from "./_types";

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

  useEffect(() => {
    void window.pond.query("settings.get", {}).then((s) => {
      const row = s as SettingsRow;
      setSettings({
        ...row,
        videoDownload: row.videoDownload ?? DEFAULT_VIDEO_DOWNLOAD,
      });
    });
  }, []);

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
        title: "Couldn't save video preferences",
        description: String(err),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  if (!settings) {
    return (
      <SectionStack>
        <SectionHeader title="Videos" />
      </SectionStack>
    );
  }

  const prefs = settings.videoDownload;
  const heightValue =
    prefs.maxHeight === null ? "any" : String(prefs.maxHeight);
  const sizeValue =
    prefs.maxFileSizeMb === null ? "any" : String(prefs.maxFileSizeMb);

  return (
    <SectionStack>
      <SectionHeader
        title="Videos"
        description="Control how Pond downloads videos from saved cards in the background."
      />

      <SettingsCard title="Background video downloads">
        <Row
          label="Download videos"
          description="When you save a video card from X, Instagram, TikTok, Cosmos, or YouTube, Pond fetches the original MP4 in the background so you can scrub it offline."
          control={
            <Switch
              checked={prefs.enabled}
              disabled={busy}
              onCheckedChange={(checked: boolean) =>
                void patchVideoDownload({ enabled: checked })
              }
            />
          }
        />
        <Row
          label="Maximum resolution"
          description="Higher means crisper playback and bigger files. 1080p is the sweet spot for most clips."
          control={
            <Select
              value={heightValue}
              disabled={busy || !prefs.enabled}
              onValueChange={(v) => {
                if (v === null || v === "any") {
                  void patchVideoDownload({ maxHeight: null });
                  return;
                }
                void patchVideoDownload({ maxHeight: Number.parseInt(v, 10) });
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="480">480p (small files)</SelectItem>
                <SelectItem value="720">720p</SelectItem>
                <SelectItem value="1080">1080p (recommended)</SelectItem>
                <SelectItem value="1440">1440p</SelectItem>
                <SelectItem value="2160">2160p / 4K</SelectItem>
                <SelectItem value="any">Original (no cap)</SelectItem>
              </SelectContent>
            </Select>
          }
        />
        <Row
          label="Maximum file size"
          description="A safety net so a 3-hour 1080p stream can't quietly fill the disk."
          control={
            <Select
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
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="200">200 MB</SelectItem>
                <SelectItem value="500">500 MB (recommended)</SelectItem>
                <SelectItem value="1000">1 GB</SelectItem>
                <SelectItem value="2000">2 GB</SelectItem>
                <SelectItem value="5000">5 GB</SelectItem>
                <SelectItem value="any">No cap</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </SettingsCard>
    </SectionStack>
  );
}
