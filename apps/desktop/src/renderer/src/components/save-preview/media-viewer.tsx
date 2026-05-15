import { Button, Tooltip, useToast } from "@pond/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NsfwOverlay } from "@/components/nsfw-overlay";
import { VideoPlayer } from "@/components/video-player";
import { useNsfwGuard } from "@/lib/use-nsfw-guard";
import { useIsVideoDownloading } from "@/pool/downloads";
import { requestVideoHeal } from "@/pool/heal";
import { buildMediaUnits } from "@/pool/media";
import type { Save } from "@/pool/types";
import { extractYouTubeId } from "./helpers";
import styles from "./styles.module.css";

interface MediaSlide {
  src: string;
  isVideo: boolean;
  posterUrl?: string;
}

export function MediaViewer({
  save,
  videoRef,
  onExpand,
}: {
  save: Save;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  onExpand?: () => void;
}) {
  const isDownloading = useIsVideoDownloading(save.id);

  const allSlides = useMemo<MediaSlide[]>(() => {
    const units = buildMediaUnits(save);
    const out: MediaSlide[] = units.map((u) => ({
      src: u.url,
      isVideo: u.isVideo,
      posterUrl: u.posterUrl,
    }));
    if (out.length === 0 && save.mediaUrl) {
      out.push({ src: save.mediaUrl, isVideo: save.mediaType === "video" });
    }
    return out;
  }, [save]);

  const [broken, setBroken] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const markBroken = useCallback((src: string) => {
    setBroken((prev) => {
      if (prev.has(src)) return prev;
      const next = new Set(prev);
      next.add(src);
      return next;
    });
  }, []);

  const slides = useMemo(
    () => allSlides.filter((s) => !broken.has(s.src)),
    [allSlides, broken],
  );

  const youtubeId = useMemo(() => extractYouTubeId(save.url), [save.url]);
  const nsfw = useNsfwGuard(save);

  const hasNoMedia = slides.length === 0;

  // One-shot heal when we land on a save whose media all errored or never
  // downloaded. `requestVideoHeal` dedupes per session; the manual
  // "Download video" button below bypasses that for explicit retries.
  useEffect(() => {
    // #region agent log
    fetch("http://127.0.0.1:7359/ingest/cec9d836-64a0-42f6-913f-8582c9879b82", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Debug-Session-Id": "7b119d",
      },
      body: JSON.stringify({
        sessionId: "7b119d",
        hypothesisId: "H6",
        location: "media-viewer.tsx:autoHealEffect",
        message: "MediaViewer mount snapshot",
        data: {
          saveId: save.id,
          url: save.url,
          mediaUrl: save.mediaUrl,
          mediaType: save.mediaType,
          filesCount: (save.files ?? []).length,
          filesSummary: (save.files ?? []).map((f) => ({
            kind: f.kind,
            path: f.path,
            size: f.size,
          })),
          allSlidesLen: allSlides.length,
          slidesLen: slides.length,
          brokenSize: broken.size,
          brokenList: [...broken],
          hasNoMedia,
          youtubeId,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    if (!hasNoMedia) return;
    if (!save.url) return;
    requestVideoHeal(save.id);
  }, [
    hasNoMedia,
    save.id,
    save.url,
    save.files,
    save.mediaUrl,
    save.mediaType,
    allSlides,
    slides,
    broken,
    youtubeId,
  ]);

  const [index, setIndex] = useState(0);
  if (slides.length === 0) {
    return <MediaMissing save={save} isDownloading={isDownloading} />;
  }
  const slide = slides[Math.min(index, slides.length - 1)];
  if (!slide) return null;
  const hasMany = slides.length > 1;

  return (
    <div
      className={styles.carousel}
      data-nsfw-blur={nsfw.shouldBlur ? "true" : undefined}
    >
      {isDownloading ? (
        <span
          className={styles.downloading}
          role="status"
          aria-label="Downloading video"
          title="Downloading video in the background"
        >
          <span className={styles["downloading-dot"]} aria-hidden="true" />
          Downloading video…
        </span>
      ) : null}
      {slide.isVideo ? (
        <VideoPlayer
          key={slide.src}
          src={slide.src}
          poster={slide.posterUrl}
          save={save}
          videoRef={videoRef}
          onError={() => {
            markBroken(slide.src);
            requestVideoHeal(save.id, slide.src);
          }}
          onExpand={onExpand}
        />
      ) : (
        <div className={styles["media-shell"]}>
          <img
            key={slide.src}
            src={slide.src}
            alt={save.title ?? ""}
            className={styles.media}
            onError={() => {
              markBroken(slide.src);
              if (slide.src === save.mediaUrl) {
                requestVideoHeal(save.id);
              }
            }}
          />
        </div>
      )}
      {nsfw.shouldBlur ? <NsfwOverlay onReveal={nsfw.reveal} /> : null}
      {hasMany ? (
        <>
          <Tooltip.Root content="Previous" side="right">
            <button
              type="button"
              className={styles.nav}
              data-side="prev"
              onClick={() =>
                setIndex((i) => (i - 1 + slides.length) % slides.length)
              }
              aria-label="Previous"
            >
              ‹
            </button>
          </Tooltip.Root>
          <Tooltip.Root content="Next" side="left">
            <button
              type="button"
              className={styles.nav}
              data-side="next"
              onClick={() => setIndex((i) => (i + 1) % slides.length)}
              aria-label="Next"
            >
              ›
            </button>
          </Tooltip.Root>
          <div className={styles.dots} aria-hidden="true">
            {slides.map((s, i) => (
              <span
                key={s.src}
                className={styles.dot}
                data-active={i === index ? "true" : undefined}
              />
            ))}
          </div>
          <div className={styles.counter}>
            {index + 1} / {slides.length}
          </div>
        </>
      ) : null}
    </div>
  );
}

function MediaMissing({
  save,
  isDownloading,
}: {
  save: Save;
  isDownloading: boolean;
}) {
  const toast = useToast();
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
            "If the file is already in the library it will reattach instantly, otherwise yt-dlp will run.",
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
    <div className={styles["media-missing"]} role="status">
      <span className={styles["media-missing-icon"]} aria-hidden="true">
        <PlayGlyph />
      </span>
      <p className={styles["media-missing-title"]}>
        {downloading ? "Fetching video…" : "Video isn't attached"}
      </p>
      <p className={styles["media-missing-body"]}>
        {downloading
          ? "This usually takes a few seconds."
          : "Pond will recover the file from disk if it's there, or fetch a fresh one."}
      </p>
      <div className={styles["media-missing-actions"]}>
        <Button size="sm" onClick={onDownload} disabled={downloading}>
          {downloading ? "Downloading…" : "Download video"}
        </Button>
        {save.url ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void window.pond.openExternal(save.url)}
          >
            Open original
          </Button>
        ) : null}
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

function PlayGlyph() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="7.5" />
      <path d="M8.25 7.5l4 2.5-4 2.5z" fill="currentColor" />
    </svg>
  );
}
