import { Tooltip } from "@pond/ui";
import { useCallback, useMemo, useState } from "react";
import { VideoPlayer } from "@/components/video-player";
import { buildMediaUnits } from "@/pool/media";
import { useResolvedTheme } from "@/pool/theme";
import type { Save } from "@/pool/types";
import styles from "./styles.module.css";

interface MediaSlide {
  src: string;
  isVideo: boolean;
  posterUrl?: string;
  width?: number;
  height?: number;
}

export function MediaViewer({
  save,
  videoRef,
}: {
  save: Save;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
}) {
  const theme = useResolvedTheme();
  const allSlides = useMemo<MediaSlide[]>(
    () =>
      buildMediaUnits(save, { theme }).map((u) => {
        const file = save.files.find((f) => f.path === u.key);
        return {
          src: u.url,
          isVideo: u.isVideo,
          posterUrl: u.posterUrl,
          width: file?.width ?? save.width ?? undefined,
          height: file?.height ?? save.height ?? undefined,
        };
      }),
    [save, theme],
  );

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
      {slide.isVideo ? (
        <VideoPlayer
          key={slide.src}
          src={slide.src}
          poster={slide.posterUrl}
          save={save}
          videoRef={videoRef}
          onError={() => markBroken(slide.src)}
        />
      ) : (
        <div className={styles["media-shell"]}>
          <img
            key={slide.src}
            src={slide.src}
            alt={save.title ?? ""}
            className={styles.media}
            decoding="async"
            fetchPriority="high"
            width={slide.width}
            height={slide.height}
            onError={() => markBroken(slide.src)}
          />
        </div>
      )}
      {hasMany ? (
        <>
          <Tooltip.Root>
            <Tooltip.Trigger
              render={
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
              }
            />
            <Tooltip.Portal>
              <Tooltip.Positioner side="right">
                <Tooltip.Popup>Previous</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
          <Tooltip.Root>
            <Tooltip.Trigger
              render={
                <button
                  type="button"
                  className={styles.nav}
                  data-side="next"
                  onClick={() => setIndex((i) => (i + 1) % slides.length)}
                  aria-label="Next"
                >
                  ›
                </button>
              }
            />
            <Tooltip.Portal>
              <Tooltip.Positioner side="left">
                <Tooltip.Popup>Next</Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
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
