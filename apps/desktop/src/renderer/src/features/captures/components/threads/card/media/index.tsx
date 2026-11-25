import { IconMediaPlay } from "@pond/icons";
import type { CSSProperties } from "react";
import type { TweetCardMedia } from "@/features/captures/components/tweet/card/lib/data";
import { formatDuration } from "@/shared/lib/format";
import styles from "./styles.module.css";

const MAX_TILES = 8;
const CAROUSEL_H = 280;
const CAROUSEL_H_COMPACT = 200;
const SINGLE_MAX_H = 430;
const SINGLE_MAX_H_COMPACT = 280;
const DEFAULT_RATIO = 4 / 5;

interface SingleMediaStyle extends CSSProperties {
  "--threads-media-max-h": string;
  "--threads-media-ratio"?: string;
}

export function ThreadsMedia({
  media,
  compact,
}: {
  media: Array<TweetCardMedia>;
  compact?: boolean;
}) {
  const tiles = media.slice(0, MAX_TILES);
  if (tiles.length === 0) return null;

  if (tiles.length === 1) {
    const first = tiles[0];
    if (!first) return null;
    return <Single media={first} compact={compact} />;
  }

  const height = compact ? CAROUSEL_H_COMPACT : CAROUSEL_H;
  return (
    <div className={styles.strip}>
      {tiles.map((m) => (
        <Tile
          key={m.url}
          media={m}
          style={{ width: carouselWidth(m, height), height }}
        />
      ))}
    </div>
  );
}

function Single({
  media,
  compact,
}: {
  media: TweetCardMedia;
  compact?: boolean;
}) {
  const maxH = compact ? SINGLE_MAX_H_COMPACT : SINGLE_MAX_H;
  const ratio =
    media.width && media.height ? media.width / media.height : undefined;
  const style: SingleMediaStyle = { "--threads-media-max-h": `${maxH}px` };
  if (ratio) style["--threads-media-ratio"] = String(ratio);
  return (
    <div
      className={styles.single}
      data-compact={compact ? "true" : undefined}
      data-ratio={ratio ? "true" : undefined}
      style={style}
    >
      <Tile media={media} />
    </div>
  );
}

function Tile({
  media,
  style,
}: {
  media: TweetCardMedia;
  style?: CSSProperties;
}) {
  const src = media.type === "video" ? media.posterUrl : media.url;
  return (
    <div className={styles.tile} style={style}>
      {src ? (
        <img
          src={src}
          alt={media.altText ?? ""}
          className={styles.image}
          draggable={false}
          decoding="sync"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className={styles.placeholder} aria-hidden />
      )}
      {media.type === "video" ? (
        <>
          <span className={styles["play-badge"]} aria-hidden>
            <IconMediaPlay size={22} />
          </span>
          {media.durationSec !== undefined ? (
            <span className={styles["duration-badge"]}>
              {formatDuration(media.durationSec)}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function carouselWidth(media: TweetCardMedia, height: number): number {
  const ratio =
    media.width && media.height ? media.width / media.height : DEFAULT_RATIO;
  return Math.round(height * ratio);
}
