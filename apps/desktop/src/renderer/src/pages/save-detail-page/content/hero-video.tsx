import { Button, useToast } from "@pond/ui";
import { useCallback, useState } from "react";
import { VideoPlayer } from "@/components/video-player";
import type { ChapterCue } from "@/components/video-player/chapters-vtt";
import { useIsVideoDownloading } from "@/pool/downloads";
import type { Save, SaveFile } from "@/pool/types";
import { buildPondUrl } from "@/pool/url";
import styles from "./styles.module.css";

interface HeroVideoProps {
  save: Save;
  chapters?: readonly ChapterCue[];
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  onError?: () => void;
  onExpand?: () => void;
}

export function HeroVideo({
  save,
  chapters,
  videoRef,
  onError,
  onExpand,
}: HeroVideoProps) {
  const files = save.files ?? [];
  const video = files.find((f) => f.kind === "video");
  const poster = pickPoster(files);

  if (!video) {
    return (
      <div className={styles["hero-frame"]} data-empty="true">
        <NoVideoYet save={save} />
      </div>
    );
  }

  const src = buildPondUrl(save.id, video);
  const posterUrl = poster ? buildPondUrl(save.id, poster) : undefined;

  return (
    <div className={styles["hero-frame"]}>
      <VideoPlayer
        key={src}
        src={src}
        poster={posterUrl}
        save={save}
        videoRef={videoRef}
        chapters={chapters}
        onError={onError}
        onExpand={onExpand}
      />
    </div>
  );
}

function pickPoster(files: SaveFile[]): SaveFile | null {
  return (
    files.find((f) => f.kind === "poster") ??
    files.find((f) => f.kind === "cover") ??
    null
  );
}

function NoVideoYet({ save }: { save: Save }) {
  const toast = useToast();
  const isDownloading = useIsVideoDownloading(save.id);
  const [busy, setBusy] = useState(false);
  const downloading = isDownloading || busy;

  const onDownload = useCallback(async () => {
    if (downloading) return;
    setBusy(true);
    try {
      const res = await window.pond.redownloadVideo(save.id);
      if (res.ok) {
        toast.add({
          title: "Fetching video…",
          description:
            "yt-dlp is fetching the video in the background. The frame will appear here when it lands.",
          type: "info",
        });
        return;
      }
      toast.add({
        title: "Couldn't download",
        description: humaniseRedownloadReason(res.reason),
        type: "error",
      });
    } catch (err) {
      toast.add({
        title: "Couldn't download",
        description: err instanceof Error ? err.message : String(err),
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }, [downloading, save.id, toast]);

  return (
    <div className={styles["hero-empty"]} role="status">
      <p className={styles["hero-empty-title"]}>
        {downloading ? "Fetching video…" : "Video isn't attached"}
      </p>
      <p className={styles["hero-empty-body"]}>
        {downloading
          ? "This usually takes a few seconds."
          : "Pond will recover the file from disk if it's there, or fetch a fresh one."}
      </p>
      <div className={styles["hero-empty-actions"]}>
        <Button size="sm" onClick={onDownload} disabled={downloading}>
          {downloading ? "Downloading…" : "Download video"}
        </Button>
      </div>
    </div>
  );
}

function humaniseRedownloadReason(
  reason: "not_found" | "no_url" | "unsupported" | "internal_error",
): string {
  switch (reason) {
    case "not_found":
      return "This save no longer exists in the library.";
    case "no_url":
      return "Pond doesn't have a source URL to give yt-dlp.";
    case "unsupported":
      return "yt-dlp doesn't support downloads from this source.";
    case "internal_error":
      return "yt-dlp threw while running. Check the desktop logs.";
  }
}
