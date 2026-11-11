import { IconBookmark, IconFile } from "@pond/icons";
import { Button } from "@pond/ui";
import type { AssistantSource } from "@shared/assistant";
import { sourceExcerpt } from "@shared/assistant-text";
import type { CSSProperties } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  aspectFor,
  clampRatio,
  pickCardUnit,
  thumbUrlFor,
} from "@/features/saves/media";
import { ensureSaves, useSave } from "@/features/saves/pool";
import styles from "./styles.module.css";

interface ThumbnailStyle extends CSSProperties {
  "--thumbnail-aspect": number;
  "--thumbnail-height-scale": number;
  "--thumbnail-width-scale": number;
}

export function useSourceCovers(ids: string[]) {
  const key = JSON.stringify(ids);
  useEffect(() => {
    if (key !== "[]") void ensureSaves(JSON.parse(key)).catch(() => undefined);
  }, [key]);
}

export function SourceThumbnail({
  id,
  previewUrl,
  source,
  size,
  fit = "square",
  visual = false,
}: {
  id: string;
  previewUrl?: string;
  source?: AssistantSource;
  size?: "compact";
  fit?: "square" | "natural";
  visual?: boolean;
}) {
  const save = useSave(id);
  const unit = useMemo(() => (save ? pickCardUnit(save) : null), [save]);
  const candidate = unit?.isVideo ? unit.posterUrl : unit?.url;
  const src =
    previewUrl ??
    (candidate?.startsWith("pond://")
      ? thumbUrlFor(candidate, 360)
      : undefined);
  const [broken, setBroken] = useState<string | null>(null);
  const [measured, setMeasured] = useState<{
    aspect: number;
    src: string;
  } | null>(null);
  const aspect =
    measured && measured.src === src
      ? measured.aspect
      : save
        ? aspectFor(save)
        : 1;
  const thumbnailStyle: ThumbnailStyle = {
    "--thumbnail-aspect": aspect,
    "--thumbnail-height-scale": Math.min(1, 1 / aspect),
    "--thumbnail-width-scale": Math.min(1, aspect),
  };
  return (
    <span
      className={styles.thumbnail}
      data-size={size}
      data-fit={fit === "square" ? undefined : fit}
      data-visual={visual || undefined}
      style={thumbnailStyle}
      aria-hidden
    >
      {src && broken !== src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          onLoad={(event) => {
            setMeasured({
              aspect: clampRatio(
                event.currentTarget.naturalWidth,
                event.currentTarget.naturalHeight,
              ),
              src,
            });
          }}
          onError={() => setBroken(src)}
        />
      ) : (
        <span className={styles["cover-fallback"]}>
          {size === "compact" ? <IconFile size={12} /> : <IconFile />}
          {visual ? (
            <span>
              {sourceExcerpt(
                source?.notes || source?.description || source?.title,
                180,
              ) || "No preview available"}
            </span>
          ) : null}
        </span>
      )}
    </span>
  );
}

export function SaveCitation({
  source,
  reference,
  onOpenSave,
  compact = false,
}: {
  source: AssistantSource;
  reference: number;
  onOpenSave: (id: string) => void;
  compact?: boolean;
}) {
  const title = sourceExcerpt(source.title, 200) || "Untitled";
  return (
    <Button
      type="button"
      variant="bare"
      className={styles.citation}
      aria-label={`Open source ${reference}: ${title}`}
      onClick={() => onOpenSave(source.id)}
      title={`Open ${title}`}
    >
      {compact ? (
        <span>{reference}</span>
      ) : (
        <>
          <IconBookmark size={12} className={styles.icon} />
          <span className={styles.title}>{title}</span>
        </>
      )}
    </Button>
  );
}
