import { createContext, use } from "react";

interface VideoState {
  playing: boolean;
  ended: boolean;
  currentTime: number;
  duration: number;
  buffered: number;
  buffering: boolean;
  volume: number;
  muted: boolean;
  rate: number;
  fullscreen: boolean;
  fullscreenSupported: boolean;
  controlsVisible: boolean;
}

export interface VideoActions {
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
  showControls: () => void;
}

interface VideoMeta {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  video: HTMLVideoElement | null;
  rootRef: React.RefObject<HTMLDivElement | null>;
  registerVideo: (el: HTMLVideoElement | null) => void;
}

export interface VideoContextValue {
  state: VideoState;
  actions: VideoActions;
  meta: VideoMeta;
  chrome: boolean;
}

export const VideoContext = createContext<VideoContextValue | null>(null);

export function useVideo(): VideoContextValue {
  const context = use(VideoContext);
  if (!context) {
    throw new Error("Video.* parts must be rendered inside <Video.Root>");
  }
  return context;
}
