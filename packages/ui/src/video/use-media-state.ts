import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { bufferedEnd, clamp, frameStepTime } from "./lib";

interface MediaState {
  playing: boolean;
  ended: boolean;
  currentTime: number;
  duration: number;
  metadataLoaded: boolean;
  buffered: number;
  buffering: boolean;
  volume: number;
  muted: boolean;
  rate: number;
  fullscreen: boolean;
  fullscreenSupported: boolean;
}

interface MediaActions {
  togglePlay: () => void;
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  seekBy: (delta: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setRate: (rate: number) => void;
  toggleFullscreen: () => void;
  stepFrame: (delta: number) => void;
}

const MEDIA_EVENTS = [
  "emptied",
  "loadstart",
  "play",
  "pause",
  "ended",
  "seeked",
  "timeupdate",
  "durationchange",
  "loadedmetadata",
  "progress",
  "volumechange",
  "ratechange",
] as const;

const INITIAL: MediaState = {
  playing: false,
  ended: false,
  currentTime: 0,
  duration: 0,
  metadataLoaded: false,
  buffered: 0,
  buffering: false,
  volume: 1,
  muted: false,
  rate: 1,
  fullscreen: false,
  fullscreenSupported: false,
};

const subscribeNever = () => () => {};
const readFullscreenEnabled = () => document.fullscreenEnabled;
const readFullscreenUnsupported = () => false;

/** A play cut short by a pause or refused by autoplay policy leaves the video paused, which the controls already show. */
function keepPaused() {}

/** A refused fullscreen change leaves the player where it was, which the controls already show. */
function keepScreenMode() {}

export interface MediaStateApi {
  state: MediaState;
  actions: MediaActions;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  video: HTMLVideoElement | null;
  rootRef: React.RefObject<HTMLDivElement | null>;
  registerVideo: (el: HTMLVideoElement | null) => void;
}

export function useMediaState(
  frameRate?: number | null,
  fullscreenTarget?: HTMLElement | null,
  initialMuted = false,
): MediaStateApi {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const fullscreenTargetRef = useRef(fullscreenTarget);
  useEffect(() => {
    fullscreenTargetRef.current = fullscreenTarget;
  }, [fullscreenTarget]);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [mediaState, setState] = useState<MediaState>(() => ({
    ...INITIAL,
    muted: initialMuted,
  }));
  const fullscreenSupported = useSyncExternalStore(
    subscribeNever,
    readFullscreenEnabled,
    readFullscreenUnsupported,
  );
  const state = useMemo(
    () => ({ ...mediaState, fullscreenSupported }),
    [mediaState, fullscreenSupported],
  );

  const registerVideo = useCallback((el: HTMLVideoElement | null) => {
    videoRef.current = el;
    setVideoEl(el);
  }, []);

  useEffect(() => {
    const v = videoEl;
    if (!v) return;
    const sync = () => {
      setState((s) => ({
        ...s,
        playing: !v.paused,
        ended: v.ended,
        currentTime: v.currentTime,
        duration: Number.isFinite(v.duration) ? v.duration : 0,
        /** The media element reports NaN for `duration` until metadata loads, and again after a source change. */
        metadataLoaded: !Number.isNaN(v.duration),
        volume: v.volume,
        muted: v.muted,
        rate: v.playbackRate,
        buffered: bufferedEnd(v),
      }));
    };
    const setBuffering = (buffering: boolean) =>
      setState((s) => (s.buffering === buffering ? s : { ...s, buffering }));
    const onWaiting = () => setBuffering(true);
    const onResume = () => setBuffering(false);
    const RESUME_EVENTS = ["playing", "canplay", "seeked", "pause"] as const;
    const WAIT_EVENTS = ["waiting", "stalled", "seeking"] as const;

    for (const event of MEDIA_EVENTS) v.addEventListener(event, sync);
    for (const event of WAIT_EVENTS) v.addEventListener(event, onWaiting);
    for (const event of RESUME_EVENTS) v.addEventListener(event, onResume);
    sync();
    return () => {
      for (const event of MEDIA_EVENTS) v.removeEventListener(event, sync);
      for (const event of WAIT_EVENTS) v.removeEventListener(event, onWaiting);
      for (const event of RESUME_EVENTS) v.removeEventListener(event, onResume);
    };
  }, [videoEl]);

  useEffect(() => {
    const onFullscreen = () => {
      const target = fullscreenTargetRef.current ?? rootRef.current;
      setState((s) => ({
        ...s,
        fullscreen: target !== null && document.fullscreenElement === target,
      }));
    };
    document.addEventListener("fullscreenchange", onFullscreen);
    onFullscreen();
    return () => document.removeEventListener("fullscreenchange", onFullscreen);
  }, []);

  const seek = useCallback((time: number) => {
    const v = videoRef.current;
    if (!v) return;
    const d = v.duration;
    v.currentTime = Number.isFinite(d) ? clamp(time, 0, d) : Math.max(0, time);
  }, []);

  const setVolume = useCallback((volume: number) => {
    const v = videoRef.current;
    if (!v) return;
    const next = clamp(volume, 0, 1);
    v.volume = next;
    if (next > 0 && v.muted) v.muted = false;
  }, []);

  const actions = useMemo<MediaActions>(
    () => ({
      togglePlay: () => {
        const v = videoRef.current;
        if (!v) {
          return;
        }
        if (v.paused) {
          void v.play().catch(keepPaused);
        } else {
          v.pause();
        }
      },
      play: () => void videoRef.current?.play().catch(keepPaused),
      pause: () => videoRef.current?.pause(),
      seek,
      seekBy: (delta: number) => {
        const v = videoRef.current;
        if (v) seek(v.currentTime + delta);
      },
      setVolume,
      toggleMute: () => {
        const v = videoRef.current;
        if (v) v.muted = !v.muted;
      },
      setRate: (rate: number) => {
        const v = videoRef.current;
        if (v) v.playbackRate = rate;
      },
      toggleFullscreen: () => {
        const target = fullscreenTargetRef.current ?? rootRef.current;
        if (!target) return;
        if (document.fullscreenElement === target) {
          void document.exitFullscreen().catch(keepScreenMode);
        } else {
          void target.requestFullscreen().catch(keepScreenMode);
        }
      },
      stepFrame: (delta: number) => {
        const v = videoRef.current;
        if (!v) return;
        const next = frameStepTime(v.currentTime, delta, frameRate);
        if (next === null) return;
        if (!v.paused) v.pause();
        seek(next);
      },
    }),
    [seek, setVolume, frameRate],
  );

  return { state, actions, videoRef, video: videoEl, rootRef, registerVideo };
}
