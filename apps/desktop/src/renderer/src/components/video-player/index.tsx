import "@videojs/react/video/skin.css";

import {
  IconFullScreenOutline18,
  IconMediaNextOutline18,
  IconMediaPauseOutline18,
  IconMediaPlayOutline18,
  IconMediaPreviousOutline18,
  IconVolumeOffOutline18,
  IconVolumeOutline18,
  IconWindowBottomRightOutline18,
} from "@pond/icons/outline/18";
import {
  Controls,
  createPlayer,
  FullscreenButton,
  Hotkey,
  MuteButton,
  PiPButton,
  PlayButton,
  Popover,
  SeekButton,
  Slider,
  Time,
  TimeSlider,
  useHotkey,
  usePlayer,
  VolumeSlider,
} from "@videojs/react";
import { Video, videoFeatures } from "@videojs/react/video";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Save } from "@/pool/types";
import { type ChapterCue, chaptersToVttUrl } from "./chapters-vtt";
import { VideoContextMenu } from "./context-menu";
import { ScrubPreview } from "./scrub-preview";
import { SPEED_OPTIONS } from "./speed-options";
import styles from "./styles.module.css";

const Player = createPlayer({ features: videoFeatures });

// The store's state is exposed as `UnknownState`; we know which features we
// configured, so narrow at the selector boundary.
type Availability = "available" | "unavailable" | "unsupported";
type PlayerStateSlice = {
  playbackRate: number;
  setPlaybackRate: (rate: number) => void;
  muted: boolean;
  volume: number;
  volumeAvailability: Availability;
  pip: boolean;
  pipAvailability: Availability;
  requestPictureInPicture: () => Promise<void>;
  togglePictureInPicture: () => Promise<void>;
  fullscreenAvailability: Availability;
};
const select =
  <K extends keyof PlayerStateSlice>(key: K) =>
  (s: unknown) =>
    (s as PlayerStateSlice)[key];

const SEEK_BUTTON_STEP = 10;
const SEEK_HOTKEY_STEP = 5;
const VOLUME_HOTKEY_STEP = 0.1;
const FRAME_STEP_SECONDS = 1 / 30;

interface VideoPlayerProps {
  src: string;
  poster?: string;
  save: Save;
  videoRef?: React.MutableRefObject<HTMLVideoElement | null>;
  chapters?: readonly ChapterCue[];
  onError?: () => void;
}

export function VideoPlayer({
  src,
  poster,
  save,
  videoRef,
  chapters,
  onError,
}: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const internalVideoRef = useRef<HTMLVideoElement | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);

  const setVideoRef = useCallback(
    (el: HTMLVideoElement | null) => {
      internalVideoRef.current = el;
      if (videoRef) videoRef.current = el;
    },
    [videoRef],
  );

  const onContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  const chaptersVttUrl = useMemo(
    () => (chapters && chapters.length > 0 ? chaptersToVttUrl(chapters) : null),
    [chapters],
  );

  useEffect(() => {
    if (!chaptersVttUrl) return;
    return () => URL.revokeObjectURL(chaptersVttUrl);
  }, [chaptersVttUrl]);

  const handleError = useCallback(() => {
    onError?.();
  }, [onError]);

  return (
    <Player.Provider>
      <Player.Container
        ref={containerRef}
        className={styles.root}
        onContextMenu={onContextMenu}
      >
        <Video
          src={src}
          poster={poster}
          playsInline
          ref={setVideoRef}
          className={styles.video}
          onError={handleError}
        >
          {chaptersVttUrl ? (
            <track
              src={chaptersVttUrl}
              kind="chapters"
              srcLang="en"
              label="Chapters"
              default
            />
          ) : null}
        </Video>

        <PlayerHotkeys videoRef={internalVideoRef} />

        <PlayerControls
          src={src}
          save={save}
          containerRef={containerRef}
          ctxMenu={ctxMenu}
          onCloseCtxMenu={closeCtxMenu}
        />
      </Player.Container>
    </Player.Provider>
  );
}

function PlayerHotkeys({
  videoRef,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  const setPlaybackRate = usePlayer(select("setPlaybackRate"));
  const playbackRateRef = useRef(0);
  playbackRateRef.current = usePlayer(select("playbackRate"));

  const stepSpeed = useCallback(
    (delta: 1 | -1) => {
      const current = playbackRateRef.current;
      const idx = SPEED_OPTIONS.indexOf(
        current as (typeof SPEED_OPTIONS)[number],
      );
      const base = idx < 0 ? SPEED_OPTIONS.indexOf(1) : idx;
      const next = Math.min(
        SPEED_OPTIONS.length - 1,
        Math.max(0, base + delta),
      );
      const target = SPEED_OPTIONS[next];
      if (target !== undefined) setPlaybackRate(target);
    },
    [setPlaybackRate],
  );

  useHotkey({
    keys: ">",
    onActivate: () => stepSpeed(1),
  });

  useHotkey({
    keys: "<",
    onActivate: () => stepSpeed(-1),
  });

  const stepFrame = useCallback(
    (delta: 1 | -1) => {
      const video = videoRef.current;
      if (!video) return;
      if (!video.paused) video.pause();
      video.currentTime = Math.max(
        0,
        video.currentTime + delta * FRAME_STEP_SECONDS,
      );
    },
    [videoRef],
  );

  useHotkey({
    keys: ".",
    onActivate: () => stepFrame(1),
  });

  useHotkey({
    keys: ",",
    onActivate: () => stepFrame(-1),
  });

  return (
    <>
      <Hotkey keys="k" action="togglePaused" />
      <Hotkey keys="Space" action="togglePaused" />
      <Hotkey keys="m" action="toggleMuted" />
      <Hotkey keys="f" action="toggleFullscreen" />
      <Hotkey keys="p" action="togglePictureInPicture" />
      <Hotkey keys="ArrowLeft" action="seekStep" value={-SEEK_HOTKEY_STEP} />
      <Hotkey keys="ArrowRight" action="seekStep" value={SEEK_HOTKEY_STEP} />
      <Hotkey keys="ArrowUp" action="volumeStep" value={VOLUME_HOTKEY_STEP} />
      <Hotkey
        keys="ArrowDown"
        action="volumeStep"
        value={-VOLUME_HOTKEY_STEP}
      />
      <Hotkey keys="0-9" action="seekToPercent" />
    </>
  );
}

function PlayerControls({
  src,
  save,
  containerRef,
  ctxMenu,
  onCloseCtxMenu,
}: {
  src: string;
  save: Save;
  containerRef: React.RefObject<HTMLDivElement | null>;
  ctxMenu: { x: number; y: number } | null;
  onCloseCtxMenu: () => void;
}) {
  const playbackRate = usePlayer(select("playbackRate"));
  const setPlaybackRate = usePlayer(select("setPlaybackRate"));
  const requestPip = usePlayer(select("requestPictureInPicture"));
  const pipAvailable = usePlayer(select("pipAvailability")) === "available";
  const volumeUnsupported =
    usePlayer(select("volumeAvailability")) === "unsupported";
  const fullscreenAvailable =
    usePlayer(select("fullscreenAvailability")) === "available";
  const seekSliderRef = useRef<HTMLDivElement | null>(null);

  const onSpeedChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setPlaybackRate(Number(e.currentTarget.value));
    },
    [setPlaybackRate],
  );

  return (
    <>
      <Controls.Root className={styles.controls}>
        <Controls.Group
          className={styles["controls-group"]}
          aria-label="Playback controls"
        >
          <PlayButton
            className={styles.btn}
            render={(props, state) => (
              <button
                {...props}
                type="button"
                aria-label={
                  state.paused
                    ? "Play (keyboard shortcut k)"
                    : "Pause (keyboard shortcut k)"
                }
              >
                {state.paused ? (
                  <IconMediaPlayOutline18 width={14} height={14} />
                ) : (
                  <IconMediaPauseOutline18 width={14} height={14} />
                )}
              </button>
            )}
          />

          <SeekButton
            seconds={-SEEK_BUTTON_STEP}
            className={styles.btn}
            render={(props) => (
              <button
                {...props}
                type="button"
                aria-label={`Seek back ${SEEK_BUTTON_STEP} seconds`}
              >
                <IconMediaPreviousOutline18 width={14} height={14} />
              </button>
            )}
          />

          <SeekButton
            seconds={SEEK_BUTTON_STEP}
            className={styles.btn}
            render={(props) => (
              <button
                {...props}
                type="button"
                aria-label={`Seek forward ${SEEK_BUTTON_STEP} seconds`}
              >
                <IconMediaNextOutline18 width={14} height={14} />
              </button>
            )}
          />

          <VolumeControl unsupported={volumeUnsupported} />

          <Time.Value type="current" className={styles.time} />

          <TimeSlider.Root
            ref={seekSliderRef}
            className={styles["seek-slider"]}
          >
            <TimeSlider.Track className={styles["slider-track"]}>
              <TimeSlider.Buffer className={styles["slider-buffer"]} />
              <TimeSlider.Fill className={styles["slider-fill"]} />
            </TimeSlider.Track>
            <TimeSlider.Thumb className={styles["slider-thumb"]} />
            <Slider.Preview className={styles["slider-preview"]}>
              <ScrubPreview src={src} sliderRef={seekSliderRef} />
              <TimeSlider.Value
                type="pointer"
                className={styles["slider-preview-time"]}
              />
            </Slider.Preview>
          </TimeSlider.Root>

          <Time.Value type="duration" className={styles.time} />

          <select
            className={styles["speed-select"]}
            aria-label="Change playback rate (keyboard shortcut > or <)"
            value={playbackRate}
            onChange={onSpeedChange}
          >
            {SPEED_OPTIONS.map((rate) => (
              <option key={rate} value={rate}>
                {rate}×
              </option>
            ))}
          </select>

          {pipAvailable ? (
            <PiPButton
              className={styles.btn}
              render={(props) => (
                <button
                  {...props}
                  type="button"
                  aria-label="Picture-in-Picture (keyboard shortcut p)"
                >
                  <IconWindowBottomRightOutline18 width={14} height={14} />
                </button>
              )}
            />
          ) : null}

          {fullscreenAvailable ? (
            <FullscreenButton
              className={styles.btn}
              render={(props) => (
                <button
                  {...props}
                  type="button"
                  aria-label="Full window (keyboard shortcut f)"
                >
                  <IconFullScreenOutline18 width={14} height={14} />
                </button>
              )}
            />
          ) : null}
        </Controls.Group>
      </Controls.Root>

      {ctxMenu ? (
        <VideoContextMenu
          position={ctxMenu}
          save={save}
          containerRef={containerRef}
          playbackRate={playbackRate}
          onSetPlaybackRate={setPlaybackRate}
          onRequestPip={requestPip}
          onClose={onCloseCtxMenu}
        />
      ) : null}
    </>
  );
}

function VolumeControl({ unsupported }: { unsupported: boolean }) {
  const muted = usePlayer(select("muted"));
  const volume = usePlayer(select("volume"));

  const trigger = (
    <MuteButton
      className={styles.btn}
      render={(props, state) => {
        const isMuted = unsupported || state.muted || volume === 0;
        return (
          <button
            {...props}
            type="button"
            disabled={unsupported || undefined}
            aria-label={
              isMuted
                ? "Unmute (keyboard shortcut m)"
                : "Mute (keyboard shortcut m)"
            }
          >
            {muted || volume === 0 ? (
              <IconVolumeOffOutline18 width={14} height={14} />
            ) : (
              <IconVolumeOutline18 width={14} height={14} />
            )}
          </button>
        );
      }}
    />
  );

  if (unsupported) return trigger;

  return (
    <Popover.Root openOnHover delay={200} closeDelay={120} side="top">
      <Popover.Trigger render={trigger} />
      <Popover.Popup className={styles["volume-popup"]}>
        <VolumeSlider.Root
          orientation="vertical"
          className={styles["volume-slider"]}
        >
          <VolumeSlider.Track className={styles["slider-track"]}>
            <VolumeSlider.Fill className={styles["slider-fill"]} />
          </VolumeSlider.Track>
          <VolumeSlider.Thumb className={styles["slider-thumb"]} />
        </VolumeSlider.Root>
      </Popover.Popup>
    </Popover.Root>
  );
}
