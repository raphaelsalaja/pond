import { useCallback } from "react";
import { CARD_THUMB_WIDTH } from "@/components/save/card/media/lib/constants";
import { useImageReady } from "@/components/save/card/media/lib/use-image-ready";
import type { MediaUnit } from "@/lib/media/units";
import { withThumbWidth } from "@/lib/media/url";
import type { Save } from "@/lib/types";
import { recordAspect } from "@/stores/aspect";
import styles from "./styles.module.css";

/** The parent owns the active index and seen set driven by pointer scrubbing, so this stays presentational; `slides[0]` is the resting image. */
export function HoverGallery({
  save,
  slides,
  active,
  seen,
  onBroken,
  onReady,
}: {
  save: Save;
  slides: MediaUnit[];
  active: number;
  seen: ReadonlySet<number>;
  onBroken: () => void;
  onReady: () => void;
}) {
  return (
    <>
      {slides.map((unit, i) =>
        seen.has(i) ? (
          <GallerySlide
            key={unit.url}
            save={save}
            unit={unit}
            primary={i === 0}
            active={i === active}
            onBroken={onBroken}
            onReady={onReady}
          />
        ) : null,
      )}
    </>
  );
}

function GallerySlide({
  save,
  unit,
  primary,
  active,
  onBroken,
  onReady,
}: {
  save: Save;
  unit: MediaUnit;
  primary: boolean;
  active: boolean;
  onBroken: () => void;
  onReady: () => void;
}) {
  /** Only the primary slide feeds the card's aspect ratio; secondaries must not override it. */
  const file = save.files.find((f) => f.path === unit.key);
  const w = primary ? (file?.width ?? save.width ?? undefined) : undefined;
  const h = primary ? (file?.height ?? save.height ?? undefined) : undefined;
  const src = withThumbWidth(unit.url, CARD_THUMB_WIDTH);
  const reportReady = useCallback(
    (image: HTMLImageElement) => {
      if (!primary) return;
      recordAspect(save.id, image.naturalWidth, image.naturalHeight);
      onReady();
    },
    [onReady, primary, save.id],
  );
  const ready = useImageReady(src, reportReady);

  return (
    <img
      ref={ready.ref}
      src={src}
      alt=""
      /** TanStack Virtual already controls the card runway. Do not defer its resting image a second time. */
      loading={primary ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={primary ? "auto" : "low"}
      width={w}
      height={h}
      className={styles.slide}
      data-active={active ? "true" : undefined}
      data-loaded={ready.loaded ? "true" : "false"}
      onLoad={ready.onLoad}
      onError={primary ? onBroken : undefined}
    />
  );
}
