import type { DownloadRange } from "@shared/downloader-contracts";
import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";
import type { Clip } from "./clip";
import { clampRange, formatClock, MIN_CLIP_SECONDS, shiftRange } from "./range";

export type Edge = "start" | "end" | "window";

const SNAP_PX = 8;

interface Drag {
  edge: Edge;
  origin: number;
  range: DownloadRange;
  targets: readonly number[];
}

interface Snap {
  enabled: boolean;
  targets: readonly number[];
}

interface Snapped {
  time: number;
  guide: number | null;
}

/** Pointer and keyboard wiring for a two-edge range over one track element. */
export function useRangeDrag(clip: Clip, snap?: Snap) {
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [active, setActive] = useState<Edge | null>(null);
  const [guide, setGuide] = useState<number | null>(null);
  const { duration, range, setRange } = clip;

  const timeAt = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box || box.width === 0) return 0;
    return (
      Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * duration
    );
  };

  const snapTime = (
    time: number,
    targets: readonly number[],
    free: boolean,
  ): Snapped => {
    if (!snap?.enabled || free) return { time, guide: null };
    const width = track.current?.getBoundingClientRect().width ?? 0;
    const tolerance = width > 0 ? (SNAP_PX / width) * duration : 0;
    let best: number | null = null;
    for (const target of targets) {
      const distance = Math.abs(target - time);
      if (distance > tolerance) continue;
      if (best == null || distance < Math.abs(best - time)) best = target;
    }
    return best == null
      ? { time: Math.round(time), guide: null }
      : { time: best, guide: best };
  };

  const apply = (current: Drag, time: number, free: boolean) => {
    if (current.edge === "window") {
      const length = current.range.end - current.range.start;
      const start = current.range.start + time - current.origin;
      const head = snapTime(start, current.targets, free);
      const tail = snapTime(start + length, current.targets, free);
      const useTail =
        tail.guide != null &&
        (head.guide == null ||
          Math.abs(tail.guide - (start + length)) <
            Math.abs(head.guide - start));
      const next = useTail ? tail.time - length : head.time;
      setGuide(useTail ? tail.guide : head.guide);
      setRange(shiftRange(current.range, next - current.range.start, duration));
      return;
    }
    const snapped = snapTime(time, current.targets, free);
    setGuide(snapped.guide);
    if (current.edge === "start") {
      setRange({
        start: Math.min(snapped.time, current.range.end - MIN_CLIP_SECONDS),
        end: current.range.end,
      });
    } else {
      setRange({
        start: current.range.start,
        end: Math.max(snapped.time, current.range.start + MIN_CLIP_SECONDS),
      });
    }
  };

  const start = (event: PointerEvent<HTMLElement>, edge: Edge) => {
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      edge,
      origin: timeAt(event.clientX),
      range,
      targets: snap?.targets ?? [],
    };
    setActive(edge);
  };

  const end = () => {
    drag.current = null;
    setActive(null);
    setGuide(null);
  };

  const pointer = {
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (drag.current) {
        apply(drag.current, timeAt(event.clientX), event.altKey);
      }
    },
    onPointerUp: end,
    onPointerCancel: end,
  };

  const nudge = (event: KeyboardEvent<HTMLElement>, edge: "start" | "end") => {
    const step = event.shiftKey ? 10 : 1;
    const delta =
      event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
    if (!delta) return;
    event.preventDefault();
    event.stopPropagation();
    setRange(
      clampRange(
        edge === "start"
          ? { start: range.start + delta, end: range.end }
          : { start: range.start, end: range.end + delta },
        duration,
      ),
    );
  };

  return {
    track,
    active,
    guide,
    /** Spread on the strip: a press grabs the nearer edge and follows the pointer. */
    trackProps: {
      ...pointer,
      onPointerDown: (event: PointerEvent<HTMLElement>) => {
        const time = timeAt(event.clientX);
        const edge =
          Math.abs(time - range.start) < Math.abs(time - range.end)
            ? "start"
            : "end";
        start(event, edge);
        apply(
          { edge, origin: time, range, targets: snap?.targets ?? [] },
          time,
          event.altKey,
        );
      },
    },
    windowProps: {
      ...pointer,
      onPointerDown: (event: PointerEvent<HTMLElement>) =>
        start(event, "window"),
    },
    handleProps: (edge: "start" | "end") => ({
      ...pointer,
      role: "slider",
      tabIndex: 0,
      "aria-label": edge === "start" ? "Start" : "End",
      "aria-valuemin": 0,
      "aria-valuemax": Math.round(duration),
      "aria-valuenow": Math.round(edge === "start" ? range.start : range.end),
      "aria-valuetext": formatClock(edge === "start" ? range.start : range.end),
      "data-active": active === edge || undefined,
      onPointerDown: (event: PointerEvent<HTMLElement>) => start(event, edge),
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => nudge(event, edge),
    }),
  };
}
