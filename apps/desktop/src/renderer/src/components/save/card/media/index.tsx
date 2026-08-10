import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { BlurPlaceholder } from "@/components/save/card/media/blur-placeholder";
import { DownloadingBadge } from "@/components/save/card/media/downloading-badge";
import { HoverGallery } from "@/components/save/card/media/hover-gallery";
import { HoverVideo } from "@/components/save/card/media/hover-video";
import { CardImage } from "@/components/save/card/media/image";
import { useIsVideoDownloading } from "@/hooks/use-is-video-downloading";
import { useResolvedTheme } from "@/hooks/use-resolved-theme";
import { cardPreviewSource } from "@/lib/media/card-preview";
import { buildMediaUnits, pickPrimaryUnit } from "@/lib/media/units";
import { withThumbWidth } from "@/lib/media/url";
import { ensureTextCover } from "@/lib/save/ensure-text-cover";
import { isTextOnlySave, textBodyForSave } from "@/lib/save/text";
import type { Save } from "@/lib/types";
import { usePrefs } from "@/stores/prefs";
import { CARD_THUMB_WIDTH } from "./lib/constants";
import styles from "./styles.module.css";

export type CardLayout = "waterfall" | "grid" | "justified";

export const CardThumb = memo(function CardThumb({
  save,
  layout,
}: {
  save: Save;
  layout?: CardLayout;
}) {
  const theme = useResolvedTheme();
  const [preferences] = usePrefs("preferences");
  const unit = useMemo(
    () => pickPrimaryUnit(save, { theme, tweetCover: preferences?.tweetCover }),
    [save, theme, preferences?.tweetCover],
  );
  const isDownloading = useIsVideoDownloading(save);

  useEffect(() => {
    ensureTextCover(save);
  }, [save]);

  /** The cycle list is disabled when the cover isn't one of these images so the resting frame stays correct. */
  const slides = useMemo(() => {
    if (!unit || unit.isVideo) return null;
    const units = buildMediaUnits(save, {
      theme,
      tweetCover: preferences?.tweetCover,
    });
    const images = units.filter((u) => !u.isVideo);
    if (images.length < 2) return null;
    const idx = images.findIndex((u) => u.url === unit.url);
    if (idx < 0) return null;
    if (idx === 0) return images;
    const reordered = [...images];
    const [primary] = reordered.splice(idx, 1);
    if (primary) reordered.unshift(primary);
    return reordered;
  }, [unit, save, theme, preferences?.tweetCover]);

  const [active, setActive] = useState(0);
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0]));

  /** Handlers live here rather than on the gallery so moves over the badge overlay still bubble up and register. */
  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!slides) return;
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width === 0) return;
      const ratio = (e.clientX - rect.left) / rect.width;
      const i = Math.min(
        slides.length - 1,
        Math.max(0, Math.floor(ratio * slides.length)),
      );
      setActive((prev) => (prev === i ? prev : i));
      setSeen((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
    },
    [slides],
  );

  const onPointerLeave = useCallback(() => setActive(0), []);

  /** Track the broken src rather than a boolean so swapping the unit URL auto-clears the broken state. */
  const pickedSrc = unit?.url ?? null;
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const broken = brokenSrc !== null && brokenSrc === pickedSrc;
  const onBroken = useCallback(() => setBrokenSrc(pickedSrc), [pickedSrc]);

  const previewSrc = useMemo(() => {
    if (!unit || broken) return null;
    return cardPreviewSource(save, unit);
  }, [broken, save, unit]);
  const [loadedPreviewSrc, setLoadedPreviewSrc] = useState<string | null>(null);
  const onPreviewReady = useCallback(() => {
    if (previewSrc) setLoadedPreviewSrc(previewSrc);
  }, [previewSrc]);
  const previewLoaded = previewSrc !== null && loadedPreviewSrc === previewSrc;

  const safeActive = slides ? Math.min(active, slides.length - 1) : 0;
  const showPlaceholder = !unit || broken;
  const textPreview =
    showPlaceholder && isTextOnlySave(save) ? textBodyForSave(save) : null;

  return (
    <div
      className={styles.thumb}
      data-layout={layout}
      data-multi-media={slides && !broken ? "true" : undefined}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      {previewSrc ? (
        <BlurPlaceholder src={previewSrc} loaded={previewLoaded} />
      ) : null}
      {slides && !broken ? (
        <HoverGallery
          save={save}
          slides={slides}
          active={safeActive}
          seen={seen}
          onBroken={onBroken}
          onReady={onPreviewReady}
        />
      ) : unit && !broken && !unit.isVideo ? (
        <CardImage
          key={unit.url}
          save={save}
          unit={unit}
          onBroken={onBroken}
          onReady={onPreviewReady}
        />
      ) : null}
      {unit?.isVideo && !broken ? (
        <HoverVideo
          key={unit.url}
          saveId={save.id}
          src={unit.url}
          posterUrl={
            unit.posterUrl
              ? withThumbWidth(unit.posterUrl, CARD_THUMB_WIDTH)
              : undefined
          }
          label={save.title ?? "video"}
          onBroken={onBroken}
          onReady={onPreviewReady}
        />
      ) : null}
      {showPlaceholder ? (
        textPreview ? (
          <div className={styles.textPreview}>
            <span className={styles.textPreviewBody}>{textPreview}</span>
          </div>
        ) : (
          <div className={styles.placeholder} aria-hidden />
        )
      ) : null}
      <DownloadingBadge save={save} isDownloading={isDownloading} />
    </div>
  );
});
