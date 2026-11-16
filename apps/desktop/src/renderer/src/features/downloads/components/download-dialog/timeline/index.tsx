import { IconFlame } from "@pond/icons";
import { clsx as cn } from "clsx";
import { type PointerEvent, useRef, useState } from "react";
import { Frame } from "../frame";
import { type Clip, frameAt, percentOf, rangeStyle } from "../lib/clip";
import type { useRangeDrag } from "../lib/drag";
import type { Player } from "../lib/player";
import { formatClock, storyboardTile } from "../lib/range";
import styles from "./styles.module.css";

const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1800, 3600];
const HEAT_BARS = 72;
const STRIP_CELLS = 10;

function rulerTimes(duration: number, most: number) {
  const step = STEPS.find((candidate) => duration / candidate <= most) ?? 3600;
  const labels: number[] = [];
  for (let time = step; time < duration - step * 0.3; time += step) {
    labels.push(time);
  }
  return labels;
}

/** Evenly spaced pictures for the track, from the storyboard or the pulled frames. */
function stripCells(clip: Clip) {
  const { storyboard } = clip.probe;
  if (!storyboard && clip.frames.length < 2) return [];
  return Array.from({ length: STRIP_CELLS }, (_, index) => {
    const time = ((index + 0.5) / STRIP_CELLS) * clip.duration;
    return {
      time,
      tile: storyboard ? storyboardTile(storyboard, time) : null,
      src: storyboard ? null : frameAt(clip, time),
    };
  });
}

function heatBars(clip: Clip, count: number) {
  return Array.from({ length: count }, (_, index) => {
    const time = ((index + 0.5) / count) * clip.duration;
    const point = clip.heatmap.find(
      (entry) => time >= entry.start && time < entry.end,
    );
    return { time, value: point?.value ?? 0 };
  });
}

interface TimelineProps extends React.ComponentPropsWithoutRef<"div"> {
  clip: Clip;
  drag: ReturnType<typeof useRangeDrag>;
  player: Player;
  marks?: number;
}

/** Ruler, a filmstrip track with the trim frame, and a Most Replayed lane under a draggable playhead. */
export function Timeline({
  clip,
  drag,
  player,
  marks = 5,
  className,
  style,
  ...props
}: TimelineProps) {
  const ruler = useRef<HTMLDivElement>(null);
  const scrubbing = useRef(false);
  const [hover, setHover] = useState<number | null>(null);
  const { range, duration, replay } = clip;
  const labels = rulerTimes(duration, marks);
  const strip = stripCells(clip);
  const onReplay =
    replay != null &&
    Math.abs(replay.start - range.start) < 0.5 &&
    Math.abs(replay.end - range.end) < 0.5;

  const timeAt = (clientX: number) => {
    const box = ruler.current?.getBoundingClientRect();
    if (!box || box.width === 0) return 0;
    return Math.min(
      duration,
      Math.max(0, ((clientX - box.left) / box.width) * duration),
    );
  };

  const scrubProps = {
    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      scrubbing.current = true;
      player.seek(timeAt(event.clientX));
    },
    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      if (scrubbing.current) player.seek(timeAt(event.clientX));
    },
    onPointerUp: () => {
      scrubbing.current = false;
    },
  };

  return (
    <div
      className={cn(styles.timeline, className)}
      style={{ ...rangeStyle(clip), ...style }}
      onPointerMove={(event) => setHover(timeAt(event.clientX))}
      onPointerLeave={() => setHover(null)}
      {...props}
    >
      <div ref={ruler} className={styles.ruler} {...scrubProps}>
        {labels.map((label) => (
          <span
            key={label}
            className={styles.label}
            style={{ left: percentOf(clip, label) }}
          >
            {formatClock(label)}
          </span>
        ))}
      </div>

      <div
        ref={drag.track}
        className={styles.lane}
        data-dragging={drag.active || undefined}
        data-strip={strip.length > 0 || undefined}
        {...drag.trackProps}
      >
        {strip.length ? (
          <div className={styles.strip}>
            {strip.map((cell) => (
              <Frame
                key={cell.time}
                className={styles.cell}
                tile={cell.tile}
                src={cell.src}
              />
            ))}
          </div>
        ) : null}
        <span className={styles.shade} data-edge="start" />
        <span className={styles.shade} data-edge="end" />
        <div className={styles.clip} {...drag.windowProps}>
          <span
            className={styles.handle}
            data-edge="start"
            {...drag.handleProps("start")}
          />
          <span
            className={styles.handle}
            data-edge="end"
            {...drag.handleProps("end")}
          />
        </div>
      </div>

      {clip.heatmap.length ? (
        <div className={styles.lane} data-kind="replay">
          <div className={styles.heat}>
            {heatBars(clip, HEAT_BARS).map((bar) => (
              <span
                key={bar.time}
                className={styles.bar}
                data-inside={
                  (bar.time >= range.start && bar.time <= range.end) ||
                  undefined
                }
                style={{ height: `${Math.max(8, bar.value * 100)}%` }}
              />
            ))}
          </div>
          {replay ? (
            <button
              type="button"
              className={styles.segment}
              data-active={onReplay || undefined}
              aria-label="Most Replayed"
              style={{
                left: percentOf(clip, replay.start),
                width: `calc(${percentOf(clip, replay.end)} - ${percentOf(clip, replay.start)})`,
              }}
              onClick={() => clip.setRange(replay)}
            >
              <IconFlame size={12} />
            </button>
          ) : null}
        </div>
      ) : null}

      {drag.guide != null ? (
        <span
          className={styles.guide}
          style={{ left: percentOf(clip, drag.guide) }}
        />
      ) : null}

      {hover != null && drag.active == null ? (
        <span className={styles.hover} style={{ left: percentOf(clip, hover) }}>
          <span className={styles.tip}>{formatClock(hover)}</span>
        </span>
      ) : null}

      <div
        className={styles.playhead}
        style={{ left: percentOf(clip, player.time) }}
      >
        <span className={styles.knob} {...scrubProps} />
      </div>
    </div>
  );
}
