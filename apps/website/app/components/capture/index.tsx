import Image from "next/image";
import type { StaticImageData } from "next/image";

/** The capture script's padding around the window, in CSS pixels (`apps/desktop/demo/capture.ts`). */
const PAD = { x: 72, top: 56 };
/** Captures are taken at 2×. */
const DENSITY = 2;

interface CaptureProps {
  image: StaticImageData;
  /** Where the window's top-left corner sits in the slot. */
  left?: number;
  top?: number;
  /**
   * A point in the window, in its own pixels, to center in the slot instead of `left` and
   * `top`, for a crop that follows what a cell is about at any slot width.
   */
  focus?: { x: number; y: number };
  /** 1 shows the app at its real size. */
  scale?: number;
  /** Loads right away, for a picture above the fold. */
  priority?: boolean;
}

/**
 * A scene captured from the real app (`apps/desktop/demo`): the window with its corners and
 * shadow on a transparent PNG, placed so the window lands at `left`, `top` and the slot crops it.
 */
export function Capture({
  image,
  left = 36,
  top = 36,
  focus,
  scale = 1,
  priority = false,
}: CaptureProps) {
  const width = (image.width / DENSITY) * scale;
  const height = (image.height / DENSITY) * scale;
  return (
    <Image
      src={image}
      alt=""
      width={width}
      height={height}
      sizes={`${Math.round(width)}px`}
      quality={90}
      priority={priority}
      draggable={false}
      style={{
        position: "absolute",
        left: focus
          ? `calc(50% - ${(focus.x + PAD.x) * scale}px)`
          : left - PAD.x * scale,
        top: focus
          ? `calc(50% - ${(focus.y + PAD.top) * scale}px)`
          : top - PAD.top * scale,
        maxWidth: "none",
        userSelect: "none",
      }}
    />
  );
}
