import { typeLabelForPath } from "@shared/file-format";
import { isThumbnailKind } from "@shared/save-file-names";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { FailedBadge } from "@/features/saves/components/card/media/failed-badge";
import { FilePreview } from "@/features/saves/components/card/media/file-preview";
import { HoverGallery } from "@/features/saves/components/card/media/hover-gallery";
import { HoverVideo } from "@/features/saves/components/card/media/hover-video";
import { CardImage } from "@/features/saves/components/card/media/image";
import { TextPreview } from "@/features/saves/components/card/media/text-preview";
import { RichFilePreview } from "@/features/saves/components/card/rich-file-preview";
import type { LibraryCardView } from "@/features/saves/components/card/types";
import { useMediaPickOptions } from "@/features/saves/hooks/use-media-pick-options";
import { ensureTextCover } from "@/features/saves/lib/ensure-text-cover";
import { richFilePreviewKind } from "@/features/saves/lib/media/rich-file-preview";
import {
  buildMediaUnits,
  type MediaPickOptions,
  type MediaUnit,
  pickCardUnit,
  pickPrimaryFile,
} from "@/features/saves/lib/media/units";
import { buildPondUrl } from "@/features/saves/lib/media/url";
import { orientedThumbStyle } from "@/features/saves/lib/media-transform";
import { shouldBlurSensitiveThumbnail } from "@/features/saves/lib/sensitive-content";
import { isTextOnlySave, textBodyForSave } from "@/features/saves/lib/text";
import { aspectDimsFor, aspectFor } from "@/features/saves/state/aspect";
import type { Save, SaveFile } from "@/features/saves/types";
import { usePrefs } from "@/shared/state/prefs";
import styles from "./styles.module.css";

export const CardThumb = memo(function CardThumb({
  save,
  view,
  width,
}: {
  save: Save;
  view?: LibraryCardView;
  width?: number;
}) {
  const pickOptions = useMediaPickOptions();
  const mediaUnits = useMemo(
    () => buildMediaUnits(save, pickOptions),
    [pickOptions, save],
  );
  const unit = useMemo(
    () => pickCardUnit(save, pickOptions),
    [pickOptions, save],
  );
  const primary = useMemo(
    () => pickPrimaryFile(save, pickOptions),
    [pickOptions, save],
  );
  return (
    <PreparedCardThumb
      save={save}
      view={view}
      width={width}
      mediaUnits={mediaUnits}
      pickOptions={pickOptions}
      unit={unit}
      primary={primary}
    />
  );
});

export const PreparedCardThumb = memo(function PreparedCardThumb({
  save,
  view,
  width,
  mediaUnits,
  pickOptions,
  unit,
  primary,
}: {
  save: Save;
  view?: LibraryCardView;
  width?: number;
  mediaUnits: MediaUnit[];
  pickOptions: MediaPickOptions;
  unit: MediaUnit | null;
  primary: SaveFile | null;
}) {
  const [viewer] = usePrefs("viewer");
  const [ai] = usePrefs("ai");
  const thumbnailBackground = viewer.thumbnailBackground ?? "none";
  const blurSensitive = shouldBlurSensitiveThumbnail(
    ai.enableSensitiveContent && ai.blurSensitiveThumbnails,
    save.sensitiveScore,
  );
  const richPreview = useMemo(() => {
    if ((save.files ?? []).some((file) => isThumbnailKind(file.kind))) {
      return null;
    }
    const kind = richFilePreviewKind(primary);
    return primary && kind
      ? { file: primary, kind, url: buildPondUrl(save.id, primary) }
      : null;
  }, [primary, save]);
  const hasVideoDims = useMemo(() => {
    if (!unit?.isVideo) return false;
    const primary = (save.files ?? []).find((f) => f.path === unit.key) ?? null;
    if (
      primary?.width &&
      primary?.height &&
      primary.width > 0 &&
      primary.height > 0
    ) {
      return true;
    }
    return Boolean(
      save.width && save.height && save.width > 0 && save.height > 0,
    );
  }, [save.files, save.height, save.width, unit]);
  useEffect(() => {
    ensureTextCover(save);
  }, [save]);

  const slides = useMemo(() => {
    if (!unit || unit.isVideo) return null;
    const images = mediaUnits.filter((candidate) => !candidate.isVideo);
    if (images.length < 2) return null;
    const idx = images.findIndex((u) => u.url === unit.url);
    if (idx < 0) return null;
    if (idx === 0) return images;
    const reordered = [...images];
    const [primary] = reordered.splice(idx, 1);
    if (primary) reordered.unshift(primary);
    return reordered;
  }, [mediaUnits, unit]);

  const [active, setActive] = useState(0);
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set([0]));

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (rect.width === 0) return;
      const pointerRatio = Math.min(
        1,
        Math.max(0, (e.clientX - rect.left) / rect.width),
      );
      if (viewer.hoverZoom) {
        e.currentTarget.style.setProperty(
          "--hover-origin-x",
          `${pointerRatio * 100}%`,
        );
        e.currentTarget.style.setProperty(
          "--hover-origin-y",
          `${Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)) * 100}%`,
        );
      }
      if (!slides || viewer.thumbnailBehavior === "still") return;
      const ratio =
        viewer.thumbnailSpeed === "slow"
          ? pointerRatio ** 1.6
          : viewer.thumbnailSpeed === "fast"
            ? pointerRatio ** 0.65
            : pointerRatio;
      const i = Math.min(
        slides.length - 1,
        Math.max(0, Math.floor(ratio * slides.length)),
      );
      setActive((prev) => (prev === i ? prev : i));
      setSeen((prev) => (prev.has(i) ? prev : new Set(prev).add(i)));
    },
    [slides, viewer.hoverZoom, viewer.thumbnailBehavior, viewer.thumbnailSpeed],
  );

  const onPointerLeave = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      setActive(0);
      event.currentTarget.style.removeProperty("--hover-origin-x");
      event.currentTarget.style.removeProperty("--hover-origin-y");
    },
    [],
  );

  const pickedSrc = unit?.url ?? null;
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const broken = brokenSrc !== null && brokenSrc === pickedSrc;
  const onBroken = useCallback(() => setBrokenSrc(pickedSrc), [pickedSrc]);

  const pixel = aspectDimsFor(save, pickOptions, unit);
  const pixelAspect =
    pixel.w && pixel.h ? pixel.w / pixel.h : aspectFor(save, pickOptions);
  const fitsOrientedTile =
    view === "grid" || view === "waterfall" || view === "justified";
  const safeActive = slides ? Math.min(active, slides.length - 1) : 0;
  const showPlaceholder = (!unit || broken) && !richPreview;
  const textPreview =
    showPlaceholder && isTextOnlySave(save) ? textBodyForSave(save) : null;
  const fallbackFile = showPlaceholder ? primary : null;
  const fileLabel = fallbackFile
    ? (typeLabelForPath(fallbackFile.path) ?? "FILE")
    : null;

  return (
    <div
      className={styles.thumb}
      data-view={view}
      data-thumbnail-bg={
        thumbnailBackground !== "none" ? thumbnailBackground : undefined
      }
      data-multi-media={slides && !broken ? "true" : undefined}
      data-sensitive={blurSensitive || undefined}
      data-hover-zoom={viewer.hoverZoom || undefined}
      style={orientedThumbStyle(save, fitsOrientedTile ? pixelAspect : null)}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
    >
      <div className={styles.visual}>
        {richPreview ? (
          <RichFilePreview
            kind={richPreview.kind}
            saveId={save.id}
            title={save.title}
            file={richPreview.file}
            url={richPreview.url}
            view={view}
          />
        ) : slides && !broken ? (
          <HoverGallery
            save={save}
            slides={slides}
            pickOptions={pickOptions}
            active={safeActive}
            seen={seen}
            width={width}
            onBroken={onBroken}
          />
        ) : unit && !broken && !unit.isVideo ? (
          <CardImage
            key={unit.url}
            save={save}
            unit={unit}
            pickOptions={pickOptions}
            width={width}
            opens={mediaUnits[0]?.url}
            onBroken={onBroken}
          />
        ) : null}
        {!richPreview && unit?.isVideo && !broken ? (
          <HoverVideo
            key={unit.url}
            saveId={save.id}
            src={unit.url}
            unit={unit}
            posterUrl={unit.posterUrl}
            posterWidth={width}
            blurhash={save.blurhash}
            hasVideoDims={hasVideoDims}
            label={save.title ?? "video"}
            onBroken={onBroken}
          />
        ) : null}
        {showPlaceholder ? (
          textPreview ? (
            <TextPreview>{textPreview}</TextPreview>
          ) : fileLabel ? (
            <FilePreview label={fileLabel} />
          ) : (
            <div className={styles.placeholder} aria-hidden />
          )
        ) : null}
      </div>
      <FailedBadge save={save} />
    </div>
  );
});
