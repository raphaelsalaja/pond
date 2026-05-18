import { useEffect, useRef } from "react";
import styles from "./styles.module.css";

const PREVIEW_W = 192;
const PREVIEW_H = 108;

interface ScrubPreviewProps {
  src: string;
  sliderRef: React.RefObject<HTMLDivElement | null>;
}

export function ScrubPreview({ src, sliderRef }: ScrubPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const seekPendingRef = useRef(false);
  const queuedTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const root = sliderRef.current;
    const v = videoRef.current;
    if (!root || !v) return;

    const seekTo = (time: number) => {
      if (!Number.isFinite(time)) return;
      if (seekPendingRef.current) {
        queuedTimeRef.current = time;
        return;
      }
      seekPendingRef.current = true;
      try {
        v.currentTime = time;
      } catch {
        seekPendingRef.current = false;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const duration = v.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      const rect = root.getBoundingClientRect();
      if (rect.width <= 0) return;
      const fraction = Math.max(
        0,
        Math.min(1, (e.clientX - rect.left) / rect.width),
      );
      seekTo(fraction * duration);
    };

    const onSeeked = () => {
      const canvas = canvasRef.current;
      if (!canvas) {
        seekPendingRef.current = false;
        return;
      }
      const ctx = canvas.getContext("2d");
      const vw = v.videoWidth;
      const vh = v.videoHeight;
      if (ctx && vw > 0 && vh > 0) {
        const cw = canvas.width;
        const ch = canvas.height;
        const scale = Math.min(cw / vw, ch / vh);
        const dw = vw * scale;
        const dh = vh * scale;
        ctx.clearRect(0, 0, cw, ch);
        ctx.drawImage(v, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
      }
      seekPendingRef.current = false;
      const next = queuedTimeRef.current;
      if (next !== null) {
        queuedTimeRef.current = null;
        seekTo(next);
      }
    };

    root.addEventListener("pointermove", onPointerMove);
    v.addEventListener("seeked", onSeeked);
    return () => {
      root.removeEventListener("pointermove", onPointerMove);
      v.removeEventListener("seeked", onSeeked);
    };
  }, [sliderRef]);

  return (
    <>
      <canvas
        ref={canvasRef}
        width={PREVIEW_W}
        height={PREVIEW_H}
        className={styles["slider-thumbnail"]}
      />
      {/* biome-ignore lint/a11y/useMediaCaption: silent scrub-only video, not user-facing */}
      <video
        ref={videoRef}
        src={src}
        preload="auto"
        muted
        playsInline
        className={styles["scrub-video"]}
      />
    </>
  );
}
