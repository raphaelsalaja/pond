import { useCallback, useEffect, useState } from "react";
import { BlurHash } from "@/features/saves/components/card/media/blur-hash";
import { useImageReady } from "@/features/saves/components/card/media/lib/use-image-ready";
import { useQualityImage } from "@/features/saves/hooks/use-quality-image";
import type {
  MediaPickOptions,
  MediaUnit,
} from "@/features/saves/lib/media/units";
import {
  previewThumbUrlFor,
  sharperThumbUrlFor,
  thumbUrlFor,
} from "@/features/saves/lib/media/url";
import {
  aspectCoverKey,
  aspectDimsFor,
  recordAspect,
} from "@/features/saves/state/aspect";
import { rememberCardThumbnail } from "@/features/saves/state/card-thumbnails";
import type { Save } from "@/features/saves/types";
import { useMachineMotionPaused } from "@/shared/lib/use-machine-motion";
import { usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

export function CardImage({
  save,
  unit,
  pickOptions,
  width,
  onBroken,
  onReady,
}: {
  save: Save;
  unit: MediaUnit;
  pickOptions: MediaPickOptions;
  width?: number;
  onBroken: () => void;
  onReady?: () => void;
}) {
  const [viewer] = usePrefs("viewer");
  const motionPaused = useMachineMotionPaused();
  const { w, h } = aspectDimsFor(save, pickOptions, unit);
  const thumbnail = unit.requiresGeneratedPreview
    ? previewThumbUrlFor(unit.url, width)
    : thumbUrlFor(unit.url, width);
  const qualitySrc = useQualityImage(
    thumbnail,
    sharperThumbUrlFor(unit.url, width),
    viewer.thumbnailQuality === "quality" &&
      (width ?? 0) >= 384 &&
      !unit.requiresGeneratedPreview,
  );
  const animated = viewer.gifAutoplay && /\.gif(?:$|[?#])/i.test(unit.key);
  const [visible, setVisible] = useState(false);
  const src = animated && visible && !motionPaused ? unit.url : qualitySrc;
  const reportReady = useCallback(
    (image: HTMLImageElement) => {
      recordAspect(save.id, image.naturalWidth, image.naturalHeight, {
        coverKey: aspectCoverKey(unit),
      });
      rememberCardThumbnail(unit.url, image.currentSrc || image.src);
      onReady?.();
    },
    [onReady, save.id, unit],
  );
  const ready = useImageReady(src, reportReady, onBroken);
  useEffect(() => {
    const image = ready.ref.current;
    if (!animated || !image) return;
    const updateVisibility = () => {
      const bounds = image.getBoundingClientRect();
      setVisible(
        !document.hidden &&
          bounds.bottom >= -64 &&
          bounds.top <= window.innerHeight + 64,
      );
    };
    const observer = new IntersectionObserver(updateVisibility, {
      rootMargin: "64px",
    });
    observer.observe(image);
    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", updateVisibility);
    };
  }, [animated, ready.ref]);

  return (
    <>
      {save.blurhash && !ready.loaded ? (
        <BlurHash hash={save.blurhash} />
      ) : null}
      <img
        ref={ready.ref}
        src={src}
        alt=""
        decoding="async"
        fetchPriority="auto"
        width={w ?? undefined}
        height={h ?? undefined}
        className={styles.media}
        draggable={false}
        data-fit={viewer.galleryFit}
        data-loaded={!save.blurhash || ready.loaded ? "true" : "false"}
        onLoad={ready.onLoad}
        onError={ready.onError}
      />
    </>
  );
}
