import "vidstack/styles/base.css";

import {
  IconExpand2Outline18,
  IconMediaPauseOutline18,
  IconMediaPlayOutline18,
  IconVolumeOffOutline18,
  IconVolumeOutline18,
  IconWindowBottomRightOutline18,
} from "@pond/icons/outline";
import {
  MediaMuteButton,
  MediaOutlet,
  MediaPIPButton,
  MediaPlayButton,
  MediaPlayer,
  MediaTime,
  MediaTimeSlider,
  MediaVolumeSlider,
  useMediaRemote,
  useMediaStore,
} from "@vidstack/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Save } from "@/pool/types";
import { VideoContextMenu } from "./context-menu";
import styles from "./styles.module.css";

const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

interface VideoPlayerProps {
  src: string;
  poster?: string;
  save: Save;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  onError?: () => void;
  onExpand?: () => void;
}

export function VideoPlayer({
  src,
  poster,
  save,
  videoRef,
  onError,
  onExpand,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!videoRef || !containerRef.current) return;
    const video = containerRef.current.querySelector("video");
    if (video) videoRef.current = video;
    return () => {
      if (videoRef.current === video) videoRef.current = null;
    };
  });

  return (
    <div className={styles.root} ref={containerRef}>
      <MediaPlayer
        src={src}
        poster={poster}
        crossorigin=""
        playsinline
        onError={onError}
      >
        <PlayerInternals
          save={save}
          containerRef={containerRef}
          onExpand={onExpand}
        />
      </MediaPlayer>
    </div>
  );
}

function PlayerInternals({
  save,
  containerRef,
  onExpand,
}: {
  save: Save;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onExpand?: () => void;
}) {
  const { paused, muted, volume, playbackRate } = useMediaStore();
  const remote = useMediaRemote();
  const [speedMenuOpen, setSpeedMenuOpen] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const setSpeed = useCallback(
    (rate: number) => {
      remote.changePlaybackRate(rate);
      setSpeedMenuOpen(false);
    },
    [remote],
  );

  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: context menu trigger on video surface */}
      <div className={styles["video-area"]} onContextMenu={onContextMenu}>
        <MediaOutlet />
      </div>

      <div className={styles.controls}>
        <MediaPlayButton className={styles.btn}>
          {paused ? (
            <IconMediaPlayOutline18 width={14} height={14} />
          ) : (
            <IconMediaPauseOutline18 width={14} height={14} />
          )}
        </MediaPlayButton>

        <span className={styles.time}>
          <MediaTime type="current" />
          <span className={styles["time-separator"]}>/</span>
          <MediaTime type="duration" />
        </span>

        <div className={styles["slider-group"]}>
          <MediaTimeSlider className={styles["seek-slider"]} />
        </div>

        <div className={styles["volume-group"]}>
          <MediaMuteButton className={styles.btn}>
            {muted || volume === 0 ? (
              <IconVolumeOffOutline18 width={14} height={14} />
            ) : (
              <IconVolumeOutline18 width={14} height={14} />
            )}
          </MediaMuteButton>
          <MediaVolumeSlider className={styles["volume-slider"]} />
        </div>

        <div style={{ position: "relative" }}>
          <button
            type="button"
            className={styles["speed-btn"]}
            onClick={() => setSpeedMenuOpen((v) => !v)}
            aria-label={`Playback speed: ${playbackRate}x`}
          >
            {playbackRate}x
          </button>
          {speedMenuOpen ? (
            <SpeedMenu
              current={playbackRate}
              onSelect={setSpeed}
              onClose={() => setSpeedMenuOpen(false)}
            />
          ) : null}
        </div>

        <MediaPIPButton className={styles.btn}>
          <IconWindowBottomRightOutline18 width={14} height={14} />
        </MediaPIPButton>

        {onExpand ? (
          <button
            type="button"
            className={styles.btn}
            onClick={onExpand}
            aria-label="Expand to full screen"
          >
            <IconExpand2Outline18 width={14} height={14} />
          </button>
        ) : null}
      </div>

      {ctxMenu ? (
        <VideoContextMenu
          position={ctxMenu}
          save={save}
          containerRef={containerRef}
          remote={remote}
          playbackRate={playbackRate}
          onClose={closeCtxMenu}
        />
      ) : null}
    </>
  );
}

function SpeedMenu({
  current,
  onSelect,
  onClose,
}: {
  current: number;
  onSelect: (rate: number) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss */}
      <div
        className={styles["ctx-backdrop"]}
        onClick={onClose}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div className={styles.menu}>
        {SPEED_OPTIONS.map((rate) => (
          <button
            key={rate}
            type="button"
            className={styles["menu-item"]}
            data-active={rate === current ? "true" : undefined}
            onClick={() => onSelect(rate)}
          >
            {rate}x
          </button>
        ))}
      </div>
    </>
  );
}
