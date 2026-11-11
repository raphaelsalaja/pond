import {
  IconFullScreen as FullscreenIcon,
  IconMediaPause as PauseIcon,
  IconMediaPlay as PlayIcon,
  IconVolume as VolumeIcon,
  IconVolumeOff as VolumeOffIcon,
} from "@pond/icons";
import { clsx as cn } from "clsx";
import { useMemo } from "react";
import {
  useVideo,
  type VideoActions,
  VideoContext,
  type VideoContextValue,
} from "./context";
import { formatTime } from "./lib";
import { Scrubber } from "./scrubber";
import { SpeedSelect } from "./speed-select";
import styles from "./styles.module.css";
import { useAutoHide } from "./use-auto-hide";
import { useMediaState } from "./use-media-state";

const ICON = 16;

interface RootProps extends React.ComponentPropsWithoutRef<"div"> {
  frameRate?: number | null;
  chrome?: boolean;
  /** Element that enters full screen in place of the root, for controls rendered outside it. */
  fullscreenTarget?: HTMLElement | null;
  /** Mute at mount. Later changes stay on the element so the control can move first. */
  initialMuted?: boolean;
}

function Root({
  className,
  children,
  frameRate,
  chrome,
  fullscreenTarget,
  initialMuted = false,
  ...props
}: RootProps) {
  const {
    state,
    actions: mediaActions,
    videoRef,
    video,
    rootRef,
    registerVideo,
  } = useMediaState(frameRate, fullscreenTarget, initialMuted);
  const { controlsVisible, showControls } = useAutoHide({
    rootRef,
    videoRef,
    ended: state.ended,
  });

  const actions = useMemo<VideoActions>(
    () => ({ ...mediaActions, showControls }),
    [mediaActions, showControls],
  );

  const visible = chrome || controlsVisible;

  const value = useMemo<VideoContextValue>(
    () => ({
      state: { ...state, controlsVisible: visible },
      actions,
      meta: { videoRef, video, rootRef, registerVideo },
      chrome: !!chrome,
    }),
    [state, visible, actions, videoRef, video, rootRef, registerVideo, chrome],
  );

  return (
    <VideoContext value={value}>
      <div ref={rootRef} className={cn(styles.root, className)} {...props}>
        {children}
      </div>
    </VideoContext>
  );
}

interface MediaProps extends React.ComponentPropsWithoutRef<"video"> {}

function Media({ className, children, ...props }: MediaProps) {
  const { meta } = useVideo();
  return (
    <video
      ref={meta.registerVideo}
      className={cn(styles.video, className)}
      playsInline
      {...props}
    >
      {children}
    </video>
  );
}

interface ControlsProps extends React.ComponentPropsWithoutRef<"div"> {}

function Controls({ className, children, ...props }: ControlsProps) {
  const { state, chrome } = useVideo();
  return (
    <div
      className={cn(styles.controls, className)}
      data-visible={state.controlsVisible ? "" : undefined}
      data-chrome={chrome || undefined}
      {...props}
    >
      {children}
    </div>
  );
}

function Row({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cn(styles.bar, className)} {...props}>
      {children}
    </div>
  );
}

type ButtonProps = Omit<React.ComponentPropsWithoutRef<"button">, "type">;

function PlayButton({ className, ...props }: ButtonProps) {
  const { state, actions } = useVideo();
  return (
    <button
      type="button"
      className={cn(styles.button, className)}
      onClick={actions.togglePlay}
      aria-label={state.playing ? "Pause" : "Play"}
      {...props}
    >
      {state.playing ? (
        <PauseIcon width={ICON} height={ICON} />
      ) : (
        <PlayIcon width={ICON} height={ICON} />
      )}
    </button>
  );
}

function MuteButton({ className, ...props }: ButtonProps) {
  const { state, actions } = useVideo();
  const muted = state.muted || state.volume === 0;
  return (
    <button
      type="button"
      className={cn(styles.button, className)}
      onClick={actions.toggleMute}
      aria-label={muted ? "Unmute" : "Mute"}
      {...props}
    >
      {muted ? (
        <VolumeOffIcon width={ICON} height={ICON} />
      ) : (
        <VolumeIcon width={ICON} height={ICON} />
      )}
    </button>
  );
}

function Volume({ className }: { className?: string }) {
  return <MuteButton className={className} />;
}

function CurrentTime({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"span">) {
  const { state } = useVideo();
  return (
    <span className={cn(styles.time, className)} {...props}>
      {formatTime(state.currentTime)}
    </span>
  );
}

function Duration({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"span">) {
  const { state } = useVideo();
  return (
    <span className={cn(styles.time, className)} {...props}>
      {formatTime(state.duration)}
    </span>
  );
}

function TimeDisplay({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const { state, chrome } = useVideo();
  return (
    <div
      className={cn(styles["time-display"], className)}
      data-visible={chrome || state.controlsVisible ? "" : undefined}
      {...props}
    >
      <span>{formatTime(state.currentTime)}</span>
      <span className={styles["time-display-separator"]}>/</span>
      <span>{formatTime(state.duration)}</span>
    </div>
  );
}

function FullscreenButton({ className, ...props }: ButtonProps) {
  const { state, actions } = useVideo();
  if (!state.fullscreenSupported) return null;
  return (
    <button
      type="button"
      className={cn(styles.button, className)}
      onClick={actions.toggleFullscreen}
      aria-label={state.fullscreen ? "Exit full screen" : "Full screen"}
      {...props}
    >
      <FullscreenIcon width={ICON} height={ICON} />
    </button>
  );
}

function Spacer() {
  return <div className={styles.spacer} />;
}

export const Video = {
  Root,
  Media,
  Controls,
  Row,
  PlayButton,
  MuteButton,
  Volume,
  CurrentTime,
  Duration,
  TimeDisplay,
  Scrubber,
  SpeedSelect,
  FullscreenButton,
  Spacer,
};
