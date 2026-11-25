import { IconMediaPlay } from "@pond/icons";
import type { CSSProperties } from "react";
import type { TweetCardMedia } from "@/features/captures/components/tweet/card/lib/data";
import { formatDuration } from "@/shared/lib/format";
import styles from "./styles.module.css";

/** Twitter caps a tweet at four media tiles; extra items are dropped. */
const MAX_TILES = 4;

/** Twitter's timeline window clamps a single video between 9:16 and 16:9, so wider or taller videos letterbox instead of stretching the card. */
const VIDEO_MIN_RATIO = 9 / 16;
const VIDEO_MAX_RATIO = 16 / 9;

interface MediaGridStyle extends CSSProperties {
  "--tweet-media-ratio": string;
}

function singleRatio(m: TweetCardMedia): string | undefined {
  if (!m.width || !m.height) return undefined;
  if (m.type === "video") {
    const clamped = Math.min(
      VIDEO_MAX_RATIO,
      Math.max(VIDEO_MIN_RATIO, m.width / m.height),
    );
    return String(clamped);
  }
  return `${m.width} / ${m.height}`;
}

export function MediaGrid({
  media,
  compact,
}: {
  media: Array<TweetCardMedia>;
  compact?: boolean;
}) {
  const tiles = media.slice(0, MAX_TILES);
  if (tiles.length === 0) return null;

  const count = tiles.length;
  const single = count === 1 ? tiles[0] : undefined;
  const ratio = single ? singleRatio(single) : undefined;
  const singleVideo = single?.type === "video";
  const style: MediaGridStyle | undefined =
    count === 1 && ratio ? { "--tweet-media-ratio": ratio } : undefined;

  return (
    <div
      className={styles["media-grid"]}
      data-count={count}
      data-compact={compact ? "true" : undefined}
      data-single-video={singleVideo ? "true" : undefined}
      style={style}
    >
      {tiles.map((m, i) => (
        <Tile key={m.url} media={m} index={i} count={count} />
      ))}
    </div>
  );
}

function Tile({
  media,
  index,
  count,
}: {
  media: TweetCardMedia;
  index: number;
  count: number;
}) {
  const src = media.type === "video" ? media.posterUrl : media.url;
  const span = count === 3 && index === 0;
  return (
    <div className={styles.tile} data-span={span ? "true" : undefined}>
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
