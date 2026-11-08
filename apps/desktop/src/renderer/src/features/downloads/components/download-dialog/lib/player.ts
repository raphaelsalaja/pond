import { useEffect, useRef, useState } from "react";
import type { Clip } from "./clip";
import type { useRangeDrag } from "./drag";

/** A video element that loops the kept range and follows the trim edge being dragged. */
export function usePlayer(clip: Clip, drag: ReturnType<typeof useRangeDrag>) {
  const video = useRef<HTMLVideoElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  const playable = clip.probe.preview != null && !failed;
  const { range, duration } = clip;
  const edge =
    drag.active === "end"
      ? range.end
      : drag.active === null
        ? null
        : range.start;

  const seek = (next: number) => {
    const clamped = Math.min(duration, Math.max(0, next));
    if (video.current) video.current.currentTime = clamped;
    setTime(clamped);
  };

  useEffect(() => {
    const element = video.current;
    if (!element) return;
    if (!playing) {
      element.pause();
      return;
    }
    if (element.currentTime < range.start || element.currentTime >= range.end) {
      element.currentTime = range.start;
    }
    void element.play().catch(() => setPlaying(false));
    let frame = 0;
    const tick = () => {
      if (element.currentTime >= range.end) element.currentTime = range.start;
      setTime(element.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, range.start, range.end]);

  useEffect(() => {
    if (edge == null) return;
    if (video.current) video.current.currentTime = edge;
    setTime(edge);
  }, [edge]);

  return {
    video,
    time,
    playing,
    playable,
    toggle: () => {
      if (playable) setPlaying((current) => !current);
    },
    seek,
    fail: () => {
      setFailed(true);
      setPlaying(false);
    },
  };
}

export type Player = ReturnType<typeof usePlayer>;
