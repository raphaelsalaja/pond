import { Button, Tooltip } from "@pond/ui";
import { useCallback, useMemo, useRef, useState } from "react";
import { useIsVideoDownloading } from "@/pool/downloads";
import { requestVideoHeal } from "@/pool/heal";
import { buildMediaUnits } from "@/pool/media";
import type { Save } from "@/pool/types";
import styles from "./styles.module.css";

interface MediaSlide {
  src: string;
  isVideo: boolean;
  posterUrl?: string;
}

export function MediaViewer({
  save,
  videoRef,
}: {
  save: Save;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
}) {
  const isDownloading = useIsVideoDownloading(save.id);
  const localRef = useRef<HTMLVideoElement | null>(null);
  const ref = videoRef ?? localRef;
  const onMarkTimestamp = useCallback(async () => {
    const v = ref.current;
    if (!v) return;
    const at = v.currentTime;
    if (!Number.isFinite(at) || at <= 0) return;
    const text = window.prompt("Note for this moment? (optional)") ?? "";
    const { addVideoTimestamp } = await import("@/pool/annotations");
    await addVideoTimestamp(save, at, text.trim() || undefined);
  }, [save, ref]);

  const allSlides = useMemo<MediaSlide[]>(() => {
    const units = buildMediaUnits(save);
    const out: MediaSlide[] = units.map((u) => ({
      src: u.url,
      isVideo: u.isVideo,
      posterUrl: u.posterUrl,
    }));
    if (out.length === 0 && save.blobUrl) {
      out.push({ src: save.blobUrl, isVideo: save.mediaType === "video" });
    }
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

  const [index, setIndex] = useState(0);
  if (slides.length === 0) return null;
  const slide = slides[Math.min(index, slides.length - 1)];
  if (!slide) return null;
  const hasMany = slides.length > 1;

  return (
    <div className={styles.carousel}>
      <div className={styles["media-shell"]}>
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
          <>
            <video
              ref={ref}
              key={slide.src}
              src={slide.src}
              poster={slide.posterUrl}
              controls
              className={styles.media}
              onError={() => {
                markBroken(slide.src);
                requestVideoHeal(save.id);
              }}
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (v.videoWidth === 0 && v.videoHeight === 0) {
                  markBroken(slide.src);
                  requestVideoHeal(save.id);
                }
              }}
            >
              <track kind="captions" />
            </video>
            <Tooltip.Root content="Add a note at the current timestamp">
              <Button
                size="sm"
                variant="ghost"
                className={styles["timestamp-mark"]}
                onClick={() => void onMarkTimestamp()}
              >
                Mark timestamp
              </Button>
            </Tooltip.Root>
          </>
        ) : (
          <img
            key={slide.src}
            src={slide.src}
            alt={save.title ?? ""}
            className={styles.media}
            onError={() => markBroken(slide.src)}
          />
        )}
      </div>
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
