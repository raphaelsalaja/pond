import { IconFile } from "@pond/icons";
import { Button } from "@pond/ui";
import type { AssistantSource } from "@shared/assistant";
import { sourceExcerpt } from "@shared/assistant-text";
import type { ComponentProps, CSSProperties, ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  aspectFor,
  clampRatio,
  pickCardUnit,
  thumbUrlFor,
} from "@/features/saves/media";
import { ensureSaves, useSave } from "@/features/saves/pool";
import { hideCitedSentence, showCitedSentence } from "./cited-sentence";
import styles from "./styles.module.css";

interface ThumbnailStyle extends CSSProperties {
  "--thumbnail-aspect": number;
  "--thumbnail-height-scale": number;
  "--thumbnail-width-scale": number;
}

function isIdList(value: unknown): value is Array<string> {
  return (
    Array.isArray(value) &&
    value.every((id): id is string => typeof id === "string")
  );
}

export function useSourceCovers(ids: Array<string>) {
  const key = JSON.stringify(ids);
  useEffect(() => {
    const parsed: unknown = JSON.parse(key);
    if (key !== "[]" && isIdList(parsed)) {
      void ensureSaves(parsed).catch((cause: unknown) => {
        console.warn("[pond fish] loading source covers failed", cause);
      });
    }
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

/** An inline reference in running text: a small picture or icon, then an underlined name. */
export function InlineReference({
  media,
  label,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "children"> & {
  media: ReactNode;
  label: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="bare"
      className={
        className ? `${styles.reference} ${className}` : styles.reference
      }
      {...props}
    >
      <span className={styles.media} aria-hidden>
        {media}
      </span>
      <span className={styles.label}>{label}</span>
    </Button>
  );
}

/** A Save named inline by its own thumbnail and title. */
export function SaveReference({
  id,
  title,
  fullTitle = title,
  onOpenSave,
}: {
  id: string;
  title: string;
  /** The untrimmed title, for the accessible name and the hover tooltip. */
  fullTitle?: string;
  onOpenSave: (id: string) => void;
}) {
  return (
    <InlineReference
      media={<SourceThumbnail id={id} size="compact" />}
      label={title}
      title={fullTitle}
      aria-label={`Open ${fullTitle}`}
      onClick={() => onOpenSave(id)}
    />
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
  const hover = {
    onPointerEnter: (event: { currentTarget: HTMLElement }) =>
      showCitedSentence(event.currentTarget),
    onPointerLeave: hideCitedSentence,
    onFocus: (event: { currentTarget: HTMLElement }) =>
      showCitedSentence(event.currentTarget),
    onBlur: hideCitedSentence,
  };
  if (compact) {
    return (
      <Button
        type="button"
        variant="bare"
        className={styles.citation}
        data-citation=""
        aria-label={`Open source ${reference}: ${title}`}
        onClick={() => onOpenSave(source.id)}
        title={`Open ${title}`}
        {...hover}
      >
        <span>{reference}</span>
      </Button>
    );
  }
  return (
    <InlineReference
      data-citation=""
      media={<SourceThumbnail id={source.id} size="compact" />}
      label={title}
      aria-label={`Open source ${reference}: ${title}`}
      onClick={() => onOpenSave(source.id)}
      title={`Open ${title}`}
      {...hover}
    />
  );
}
