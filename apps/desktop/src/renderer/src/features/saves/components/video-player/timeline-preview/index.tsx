import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./styles.module.css";

function previewTime(video: HTMLVideoElement, time: number): number {
  return Math.min(time, Math.max(0, video.duration - 0.001));
}

export function TimelinePreview({ src, time }: { src: string; time: number }) {
  const preview = useRef<HTMLVideoElement>(null);
  const target = useRef(time);
  const seeking = useRef(false);
  const [ready, setReady] = useState(false);

  /** One seek in flight at a time; a new seek would abort the last before its frame paints. */
  const seek = useCallback((video: HTMLVideoElement) => {
    if (seeking.current) return;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    seeking.current = true;
    video.currentTime = previewTime(video, target.current);
  }, []);

  useEffect(() => {
    target.current = time;
    const video = preview.current;
    if (!video || video.readyState < HTMLMediaElement.HAVE_METADATA) return;
    const request = requestAnimationFrame(() => seek(video));
    return () => cancelAnimationFrame(request);
  }, [seek, time]);

  return (
    <video
      ref={preview}
      src={src}
      className={styles.preview}
      style={{ aspectRatio: "16 / 9" }}
      preload="metadata"
      muted
      playsInline
      aria-hidden
      data-ready={ready || undefined}
      onLoadedMetadata={(event) => seek(event.currentTarget)}
      onSeeked={(event) => {
        const video = event.currentTarget;
        seeking.current = false;
        setReady(true);
        if (
          Math.abs(previewTime(video, target.current) - video.currentTime) >
          0.01
        )
          seek(video);
      }}
    />
  );
}
