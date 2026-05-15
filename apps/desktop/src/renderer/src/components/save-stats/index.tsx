import { Tooltip } from "@pond/ui";
import type { RefObject, SVGProps } from "react";
import { useMemo, useState } from "react";
import {
  formatCompactNumber,
  formatFullNumber,
  formatHms,
  formatRelativeTime,
} from "@/lib/format";
import { extractSaveStats, type SaveMetricKey } from "@/pool/save-stats";
import type { Save } from "@/pool/types";
import styles from "./styles.module.css";

interface RootProps {
  save: Save;
  videoRef?: RefObject<HTMLVideoElement | null>;
}

function Root({ save, videoRef }: RootProps) {
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
        <div className={styles["meta-row"]}>
          {stats.liveStatus ? <LiveBadge status={stats.liveStatus} /> : null}
          {relative ? (
            <Tooltip.Root content={absolute ?? undefined}>
              <time
                className={styles["meta-item"]}
                dateTime={stats.publishedAt}
              >
                {relative}
              </time>
            </Tooltip.Root>
          ) : null}
          {typeof stats.durationSec === "number" ? (
            <span className={styles["meta-item"]}>
              <MetricIcon name="duration" />
              {formatHms(stats.durationSec)}
            </span>
          ) : null}
          {dimensions ? (
            <span className={styles["meta-item"]}>{dimensions}</span>
          ) : null}
          {language ? (
            <span className={styles["meta-item"]}>{language}</span>
          ) : null}
          {stats.isPaidPartnership ? (
            <span className={styles["meta-badge"]}>Paid partnership</span>
          ) : null}
        </div>
      ) : null}

      {stats.metrics.length > 0 ? (
        <div className={styles.metrics}>
          {stats.metrics.map((m) => (
            <Tooltip.Root
              key={m.key}
              content={`${formatFullNumber(m.value)} ${m.label.toLowerCase()}`}
            >
              <span className={styles["metric-chip"]}>
                <MetricIcon name={m.key} />
                <span className={styles["metric-value"]}>
                  {formatCompactNumber(m.value)}
                </span>
                <span className={styles["metric-label"]}>{m.label}</span>
              </span>
            </Tooltip.Root>
          ))}
        </div>
      ) : null}

      {hasUploader ? <UploaderRow stats={stats} /> : null}

      {stats.music?.title || stats.music?.author ? (
        <ExtraRow icon={<MetricIcon name="music" />}>
          <span className={styles["extra-text"]}>
            {stats.music.title ?? "Original sound"}
            {stats.music.author ? (
              <span className={styles["extra-muted"]}>
                {" "}
                — {stats.music.author}
              </span>
            ) : null}
          </span>
        </ExtraRow>
      ) : null}

      {stats.musicVideo?.track || stats.musicVideo?.artist ? (
        <ExtraRow icon={<MetricIcon name="music" />}>
          <span className={styles["extra-text"]}>
            {stats.musicVideo.track ?? "Track"}
            {stats.musicVideo.artist ? (
              <span className={styles["extra-muted"]}>
                {" "}
                — {stats.musicVideo.artist}
              </span>
            ) : null}
            {stats.musicVideo.album ? (
              <span className={styles["extra-muted"]}>
                {" "}
                · {stats.musicVideo.album}
              </span>
            ) : null}
          </span>
        </ExtraRow>
      ) : null}

      {stats.location ? (
        <ExtraRow icon={<MetricIcon name="location" />}>
          <span className={styles["extra-text"]}>{stats.location}</span>
        </ExtraRow>
      ) : null}

      {stats.board?.name || stats.board?.url ? (
        <ExtraRow icon={<MetricIcon name="board" />}>
          {stats.board.url ? (
            <a
              href={stats.board.url}
              target="_blank"
              rel="noreferrer"
              className={styles["extra-link"]}
            >
              {stats.board.name ?? stats.board.url}
            </a>
          ) : (
            <span className={styles["extra-text"]}>{stats.board.name}</span>
          )}
        </ExtraRow>
      ) : null}

      {stats.arenaChannels?.length ? (
        <ExtraRow icon={<MetricIcon name="hash" />}>
          <span className={styles["extra-chips"]}>
            {stats.arenaChannels.map((c, i) => {
              const label = c.title ?? c.href ?? "channel";
              return c.href ? (
                <a
                  // biome-ignore lint/suspicious/noArrayIndexKey: stable per-render order is enough here
                  key={`${label}-${i}`}
                  href={c.href}
                  target="_blank"
                  rel="noreferrer"
                  className={styles["extra-chip"]}
                >
                  {label}
                </a>
              ) : (
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: see above
                  key={`${label}-${i}`}
                  className={styles["extra-chip"]}
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
          <span className={styles["extra-chips"]}>
            {stats.cosmosClusters.map((c) => (
              <span key={c.id} className={styles["extra-chip"]}>
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

export const SaveStats = {
  Root,
};

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
          className={styles["uploader-avatar"]}
          loading="lazy"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <span className={styles["uploader-avatar-fallback"]} aria-hidden="true">
          {(name ?? "?").slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className={styles["uploader-text"]}>
        <span className={styles["uploader-kind"]}>{channelLabel}</span>
        <span className={styles["uploader-name"]}>{name ?? url}</span>
      </span>
    </>
  );

  return (
    <div className={styles["uploader-row"]}>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className={styles["uploader-link"]}
        >
          {inner}
        </a>
      ) : (
        <span className={styles["uploader-link"]}>{inner}</span>
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
        className={styles["chapters-toggle"]}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronIcon open={open} /> Chapters ({chapters.length})
      </button>
      {open ? (
        <ul className={styles["chapters-list"]}>
          {chapters.map((c, i) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: chapters are stable per save
              key={`${c.startSec}-${i}`}
              className={styles["chapters-item"]}
            >
              <button
                type="button"
                className={styles["chapters-btn"]}
                onClick={() => onSeek(c.startSec)}
                disabled={!videoRef?.current}
              >
                <span className={styles["chapters-time"]}>
                  {formatHms(c.startSec)}
                </span>
                <span className={styles["chapters-title"]}>{c.title}</span>
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
    <span
      className={styles["live-badge"]}
      data-state={isLive ? "live" : "past"}
    >
      <span className={styles["live-dot"]} aria-hidden="true" />
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
    <div className={styles["extra-row"]}>
      <span className={styles["extra-icon"]} aria-hidden="true">
        {icon}
      </span>
      {children}
    </div>
  );
}

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
  saves: "Saves",
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
    case "saves":
      return <path d="M4 2.5h8V14l-4-2.5L4 14V2.5z" />;
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
