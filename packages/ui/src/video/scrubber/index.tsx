import { Slider as SliderBase } from "@base-ui/react/slider";
import { clsx as cn } from "clsx";
import { useState } from "react";
import { useVideo } from "../context";
import { clamp, formatTime } from "../lib";
import styles from "./styles.module.css";

interface ScrubberProps {
  className?: string;
  renderPreview?: (time: number) => React.ReactNode;
}

export function Scrubber({ className, renderPreview }: ScrubberProps) {
  const { state, actions, chrome } = useVideo();
  const [pointer, setPointer] = useState<{
    at: number;
    inside: boolean;
  } | null>(null);
  const hover = pointer?.inside ? pointer.at : null;
  const max = state.duration > 0 ? state.duration : 1;
  const current = Math.min(state.currentTime, max);
  const hasDuration = state.duration > 0;

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    setPointer({
      at: clamp((event.clientX - rect.left) / rect.width, 0, 1),
      inside: true,
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const root = event.currentTarget;
    requestAnimationFrame(() => {
      const focused = root.ownerDocument.activeElement;
      if (focused instanceof HTMLElement && root.contains(focused)) {
        focused.blur();
      }
    });
  };

  return (
    <SliderBase.Root
      className={cn(styles.root, className)}
      data-chrome={chrome || undefined}
      value={current}
      min={0}
      max={max}
      step={0.01}
      onValueChange={(v) => actions.seek(Array.isArray(v) ? (v[0] ?? 0) : v)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() =>
        setPointer((previous) => previous && { ...previous, inside: false })
      }
      aria-label="Seek"
    >
      {pointer && hasDuration ? (
        <span
          className={styles.preview}
          data-open={pointer.inside || undefined}
          style={{
            left: `${pointer.at * 100}%`,
            transform: "translateX(-50%)",
          }}
          aria-hidden
        >
          {renderPreview ? (
            <span className={styles["preview-media"]}>
              {renderPreview(pointer.at * max)}
            </span>
          ) : null}
          <span className={styles["preview-time"]}>
            {formatTime(pointer.at * max)}
          </span>
          <span className={styles["preview-line"]} />
        </span>
      ) : null}
      <SliderBase.Control className={styles.control}>
        <SliderBase.Track
          className={styles.track}
          data-buffering={state.buffering ? "" : undefined}
        >
          <div
            className={styles.buffer}
            style={{ width: `${(state.buffered / max) * 100}%` }}
          />
          {hover !== null ? (
            <div
              className={styles["hover-fill"]}
              style={{ width: `${hover * 100}%` }}
            />
          ) : null}
          <SliderBase.Indicator className={styles.indicator} />
          <SliderBase.Thumb className={styles.thumb} />
        </SliderBase.Track>
      </SliderBase.Control>
    </SliderBase.Root>
  );
}
