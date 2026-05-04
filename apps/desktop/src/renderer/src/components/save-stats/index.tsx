import type { RefObject, SVGProps } from "react";
import { useMemo, useState } from "react";
import {
  formatCompactNumber,
  formatFullNumber,
  formatHms,
  formatRelativeTime,
} from "../../lib/format";
import { extractSaveStats, type SaveMetricKey } from "../../pool/save-stats";
import type { Save } from "../../pool/types";
import { Tooltip } from "../../ui";
import styles from "./styles.module.css";

interface SaveStatsProps {
  save: Save;
  /**
   * The video element rendered by `<MediaViewer>` (if any). When
   * present, clicking a chapter seeks the player to that timestamp.
   * Optional — chapters still render as a static list when no video
   * is mounted (e.g. the user is on the audio-only fallback or an
   * error state).
   */
  videoRef?: RefObject<HTMLVideoElement | null>;
}

/**
 * Surface the per-source metadata Pond already captures for every save:
 * yt-dlp view/like/comment counts, Twitter engagement, Instagram likes,
 * TikTok play counts, YouTube chapters, music attribution, location
 * tags, etc. The full mapping lives in
 * [`pool/save-stats.ts`](apps/desktop/src/renderer/src/pool/save-stats.ts).
 *
 * The panel hides itself entirely when the save has nothing useful to
 * show (e.g. a freshly captured Cosmos element with no metrics) so the
 * preview pane stays compact for media-only items.
 */
export function SaveStats({ save, videoRef }: SaveStatsProps) {
  const stats = useMemo(() => extractSaveStats(save), [save]);

  const relative = formatRelativeTime(stats.publishedAt);
  const absolute = stats.publishedAt
    ? new Date(stats.publishedAt).toLocaleString()
    : null;
  const language = stats.language ? stats.language.toUpperCase() : null;
  const dimensions = stats.videoSize
    ? `${stats.videoSize.width}×${stats.videoSize.height}${
        stats.videoSize.fps ? `@${Math.round(stats.videoSize.fps)}` : ""
      }`
    : null;

  const hasMeta =
    Boolean(relative) ||
    typeof stats.durationSec === "number" ||
    Boolean(language) ||
    Boolean(dimensions) ||
    Boolean(stats.liveStatus);

  const hasUploader = Boolean(
    stats.uploader?.name ||
      stats.channel?.name ||
      stats.uploader?.url ||
      stats.channel?.url,
  );

  const hasExtras =
    Boolean(stats.music?.title || stats.music?.author) ||
    Boolean(stats.location) ||
    Boolean(stats.board?.name || stats.board?.url) ||
    Boolean(stats.subreddit) ||
    (stats.arenaChannels?.length ?? 0) > 0 ||
    (stats.cosmosClusters?.length ?? 0) > 0 ||
    Boolean(stats.musicVideo?.track || stats.musicVideo?.artist) ||
    (stats.chapters?.length ?? 0) > 0 ||
    Boolean(stats.isPaidPartnership);

  if (!hasMeta && stats.metrics.length === 0 && !hasUploader && !hasExtras) {
    return null;
  }

  return (
    <section className={styles.stats} aria-label="Save statistics">
      {hasMeta ? (
        <div className={styles.metaRow}>
          {stats.liveStatus ? <LiveBadge status={stats.liveStatus} /> : null}
          {relative ? (
            <Tooltip content={absolute ?? undefined}>
              <time className={styles.metaItem} dateTime={stats.publishedAt}>
                {relative}
              </time>
            </Tooltip>
          ) : null}
          {typeof stats.durationSec === "number" ? (
            <span className={styles.metaItem}>
              <MetricIcon name="duration" />
              {formatHms(stats.durationSec)}
            </span>
          ) : null}
          {dimensions ? (
            <span className={styles.metaItem}>{dimensions}</span>
          ) : null}
          {language ? (
            <span className={styles.metaItem}>{language}</span>
          ) : null}
          {stats.isPaidPartnership ? (
            <span className={styles.metaBadge}>Paid partnership</span>
          ) : null}
        </div>
      ) : null}

      {stats.metrics.length > 0 ? (
        <div className={styles.metrics}>
          {stats.metrics.map((m) => (
            <Tooltip
              key={m.key}
              content={`${formatFullNumber(m.value)} ${m.label.toLowerCase()}`}
            >
              <span className={styles.metricChip}>
                <MetricIcon name={m.key} />
                <span className={styles.metricValue}>
                  {formatCompactNumber(m.value)}
                </span>
                <span className={styles.metricLabel}>{m.label}</span>
              </span>
            </Tooltip>
          ))}
        </div>
      ) : null}

      {hasUploader ? <UploaderRow stats={stats} /> : null}

      {stats.music?.title || stats.music?.author ? (
        <ExtraRow icon={<MetricIcon name="music" />}>
          <span className={styles.extraText}>
            {stats.music.title ?? "Original sound"}
            {stats.music.author ? (
              <span className={styles.extraMuted}> — {stats.music.author}</span>
            ) : null}
          </span>
        </ExtraRow>
      ) : null}

      {stats.musicVideo?.track || stats.musicVideo?.artist ? (
        <ExtraRow icon={<MetricIcon name="music" />}>
          <span className={styles.extraText}>
            {stats.musicVideo.track ?? "Track"}
            {stats.musicVideo.artist ? (
              <span className={styles.extraMuted}>
                {" "}
                — {stats.musicVideo.artist}
              </span>
            ) : null}
            {stats.musicVideo.album ? (
              <span className={styles.extraMuted}>
                {" "}
                · {stats.musicVideo.album}
              </span>
            ) : null}
          </span>
        </ExtraRow>
      ) : null}

      {stats.location ? (
        <ExtraRow icon={<MetricIcon name="location" />}>
          <span className={styles.extraText}>{stats.location}</span>
        </ExtraRow>
      ) : null}

      {stats.subreddit ? (
        <ExtraRow icon={<MetricIcon name="hash" />}>
          <span className={styles.extraText}>r/{stats.subreddit}</span>
        </ExtraRow>
      ) : null}

      {stats.board?.name || stats.board?.url ? (
        <ExtraRow icon={<MetricIcon name="board" />}>
          {stats.board.url ? (
            <a
              href={stats.board.url}
              target="_blank"
              rel="noreferrer"
              className={styles.extraLink}
            >
              {stats.board.name ?? stats.board.url}
            </a>
          ) : (
            <span className={styles.extraText}>{stats.board.name}</span>
          )}
        </ExtraRow>
      ) : null}

      {stats.arenaChannels?.length ? (
        <ExtraRow icon={<MetricIcon name="hash" />}>
          <span className={styles.extraChips}>
            {stats.arenaChannels.map((c, i) => {
              const label = c.title ?? c.href ?? "channel";
              return c.href ? (
                <a
                  // biome-ignore lint/suspicious/noArrayIndexKey: stable per-render order is enough here
                  key={`${label}-${i}`}
                  href={c.href}
                  target="_blank"
                  rel="noreferrer"
                  className={styles.extraChip}
                >
                  {label}
                </a>
              ) : (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: see above
                  key={`${label}-${i}`}
                  className={styles.extraChip}
                >
                  {label}
                </span>
              );
            })}
          </span>
        </ExtraRow>
      ) : null}

      {stats.cosmosClusters?.length ? (
        <ExtraRow icon={<MetricIcon name="hash" />}>
          <span className={styles.extraChips}>
            {stats.cosmosClusters.map((c) => (
              <span key={c.id} className={styles.extraChip}>
                {c.title ?? c.id}
              </span>
            ))}
          </span>
        </ExtraRow>
      ) : null}

      {stats.chapters?.length ? (
        <Chapters chapters={stats.chapters} videoRef={videoRef} />
      ) : null}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Sub-components                                                     */
/* ------------------------------------------------------------------ */

function UploaderRow({
  stats,
}: {
  stats: ReturnType<typeof extractSaveStats>;
}) {
  const name = stats.channel?.name ?? stats.uploader?.name;
  const url = stats.channel?.url ?? stats.uploader?.url;
  const avatar = stats.uploader?.avatar;
  const channelLabel = stats.channel?.name ? "Channel" : "Author";

  if (!name && !url) return null;

  const inner = (
    <>
      {avatar ? (
        <img
          src={avatar}
          alt=""
          className={styles.uploaderAvatar}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <span className={styles.uploaderAvatarFallback} aria-hidden="true">
          {(name ?? "?").slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className={styles.uploaderText}>
        <span className={styles.uploaderKind}>{channelLabel}</span>
        <span className={styles.uploaderName}>{name ?? url}</span>
      </span>
    </>
  );

  return (
    <div className={styles.uploaderRow}>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={styles.uploaderLink}
        >
          {inner}
        </a>
      ) : (
        <span className={styles.uploaderLink}>{inner}</span>
      )}
    </div>
  );
}

function Chapters({
  chapters,
  videoRef,
}: {
  chapters: Array<{ title: string; startSec: number }>;
  videoRef?: RefObject<HTMLVideoElement | null>;
}) {
  const [open, setOpen] = useState(false);

  const onSeek = (sec: number) => {
    const v = videoRef?.current;
    if (!v) return;
    v.currentTime = sec;
    void v.play().catch(() => {
      /* user may not have interacted yet — ignore */
    });
  };

  return (
    <div className={styles.chapters}>
      <button
        type="button"
        className={styles.chaptersToggle}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronIcon open={open} /> Chapters ({chapters.length})
      </button>
      {open ? (
        <ul className={styles.chaptersList}>
          {chapters.map((c, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: chapters are stable per save
              key={`${c.startSec}-${i}`}
              className={styles.chaptersItem}
            >
              <button
                type="button"
                className={styles.chaptersBtn}
                onClick={() => onSeek(c.startSec)}
                disabled={!videoRef?.current}
              >
                <span className={styles.chaptersTime}>
                  {formatHms(c.startSec)}
                </span>
                <span className={styles.chaptersTitle}>{c.title}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function LiveBadge({ status }: { status: string }) {
  const isLive = status === "is_live" || status === "post_live";
  const wasLive = status === "was_live";
  if (!isLive && !wasLive && status !== "is_upcoming") return null;
  const label = isLive
    ? "Live"
    : wasLive
      ? "Was live"
      : status === "is_upcoming"
        ? "Upcoming"
        : status;
  return (
    <span className={styles.liveBadge} data-state={isLive ? "live" : "past"}>
      <span className={styles.liveDot} aria-hidden="true" />
      {label}
    </span>
  );
}

function ExtraRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.extraRow}>
      <span className={styles.extraIcon} aria-hidden="true">
        {icon}
      </span>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Inline icons                                                       */
/* ------------------------------------------------------------------ */

type IconName =
  | SaveMetricKey
  | "duration"
  | "music"
  | "location"
  | "hash"
  | "board";

const ICON_TITLES: Record<IconName, string> = {
  views: "Views",
  plays: "Plays",
  likes: "Likes",
  comments: "Comments",
  replies: "Replies",
  shares: "Shares",
  reposts: "Reposts",
  bookmarks: "Bookmarks",
  downloads: "Downloads",
  connections: "Connections",
  repins: "Repins",
  upvotes: "Upvotes",
  awards: "Awards",
  dislikes: "Dislikes",
  duration: "Duration",
  music: "Music",
  location: "Location",
  hash: "Tag",
  board: "Board",
};

function MetricIcon({ name }: { name: IconName }) {
  const title = ICON_TITLES[name];
  const baseProps: SVGProps<SVGSVGElement> = {
    width: 12,
    height: 12,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    role: "img",
    "aria-hidden": true,
  };
  return (
    <svg {...baseProps}>
      <title>{title}</title>
      {iconPaths(name)}
    </svg>
  );
}

function iconPaths(name: IconName): React.ReactNode {
  switch (name) {
    case "views":
    case "plays":
      return (
        <>
          <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8s-2.5 4.5-6.5 4.5S1.5 8 1.5 8z" />
          <circle cx="8" cy="8" r="2" />
        </>
      );
    case "likes":
      return (
        <path d="M8 13.5s-5-3.2-5-7a3 3 0 0 1 5-2.2A3 3 0 0 1 13 6.5c0 3.8-5 7-5 7z" />
      );
    case "comments":
    case "replies":
      return <path d="M2.5 3.5h11v8h-7L3 14v-2.5h-.5v-8z" />;
    case "shares":
      return <path d="M11 5l3 3-3 3M14 8H6.5A2.5 2.5 0 0 0 4 10.5V13" />;
    case "reposts":
      return <path d="M3 6.5l2-2 2 2M5 4.5V11h6M13 9.5l-2 2-2-2M11 11.5V5H5" />;
    case "bookmarks":
      return <path d="M4 2.5h8V14l-4-2.5L4 14V2.5z" />;
    case "downloads":
      return <path d="M8 2v8M4.5 7.5L8 11l3.5-3.5M3 13h10" />;
    case "connections":
      return (
        <>
          <circle cx="4" cy="4" r="2" />
          <circle cx="12" cy="4" r="2" />
          <circle cx="8" cy="12" r="2" />
          <path d="M5.5 5.5l1.5 5M10.5 5.5l-1.5 5" />
        </>
      );
    case "repins":
      return (
        <>
          <circle cx="8" cy="6" r="3.5" />
          <path d="M8 9.5V14" />
        </>
      );
    case "upvotes":
      return <path d="M8 3l5 5h-3v5h-4V8H3l5-5z" />;
    case "awards":
      return (
        <>
          <circle cx="8" cy="6" r="3.5" />
          <path d="M5.5 9l-1 4.5L8 12l3.5 1.5L10.5 9" />
        </>
      );
    case "dislikes":
      return (
        <path d="M8 2.5s5 3.2 5 7a3 3 0 0 1-5 2.2A3 3 0 0 1 3 9.5c0-3.8 5-7 5-7z" />
      );
    case "duration":
      return (
        <>
          <circle cx="8" cy="8" r="6" />
          <path d="M8 4.5V8l2.5 1.5" />
        </>
      );
    case "music":
      return (
        <>
          <path d="M5 12V4l8-1.5V11" />
          <circle cx="3.5" cy="12" r="1.5" />
          <circle cx="11.5" cy="11" r="1.5" />
        </>
      );
    case "location":
      return (
        <>
          <path d="M8 14s5-4 5-8a5 5 0 0 0-10 0c0 4 5 8 5 8z" />
          <circle cx="8" cy="6" r="1.75" />
        </>
      );
    case "hash":
      return <path d="M3 6h10M3 10h10M6 3l-1 10M11 3l-1 10" />;
    case "board":
      return (
        <>
          <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
          <path d="M2.5 6h11M6 6v7.5" />
        </>
      );
    default:
      return null;
  }
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width={10}
      height={10}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-hidden="true"
      style={{
        transform: open ? "rotate(90deg)" : "none",
        transition: "transform 120ms ease",
      }}
    >
      <title>{open ? "Collapse" : "Expand"}</title>
      <path d="M3.5 2L6.5 5L3.5 8" />
    </svg>
  );
}
