import type { ImageCrop } from "@pond/schema/db";

interface ImageBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}
export function containImage(
  frame: ImageBounds,
  ratio: number | null,
): ImageBounds {
  if (!ratio || !frame.width || !frame.height) {
    return frame;
  }
  const width = Math.min(frame.width, frame.height * ratio);
  const height = width / ratio;
  return {
    left: frame.left + (frame.width - width) / 2,
    top: frame.top + (frame.height - height) / 2,
    width,
    height,
  };
}
export function imagePoint(bounds: ImageBounds, x: number, y: number) {
  return clampImagePoint({
    x: (x - bounds.left) / bounds.width,
    y: (y - bounds.top) / bounds.height,
  });
}

export function clampImagePoint(point: { x: number; y: number }) {
  return {
    x: Math.min(1, Math.max(0, point.x)),
    y: Math.min(1, Math.max(0, point.y)),
  };
}

export function inImage(point: { x: number; y: number }) {
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

export function viewToImagePoint(
  frame: ImageBounds,
  pose: { x: number; y: number; zoom: number },
  ratio: number | null,
  clientX: number,
  clientY: number,
) {
  const zoom = pose.zoom || 1;
  const localX =
    (clientX - frame.left - frame.width / 2 - pose.x) / zoom + frame.width / 2;
  const localY =
    (clientY - frame.top - frame.height / 2 - pose.y) / zoom + frame.height / 2;
  const bounds = containImage(
    { left: 0, top: 0, width: frame.width, height: frame.height },
    ratio,
  );
  if (!bounds.width || !bounds.height) {
    return { x: 0, y: 0 };
  }
  return {
    x: (localX - bounds.left) / bounds.width,
    y: (localY - bounds.top) / bounds.height,
  };
}
const MIN_CROP = 0.001;
const CROP_SNAP_THRESHOLD = 0.015;

export function fullImageCrop(): ImageCrop {
  return { x: 0, y: 0, w: 1, h: 1 };
}

export function isFullImageCrop(crop: ImageCrop): boolean {
  return crop.x === 0 && crop.y === 0 && crop.w === 1 && crop.h === 1;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function snapValue(
  value: number,
  guides: ReadonlyArray<number>,
  threshold: number,
): number {
  let closest = value;
  let distance = threshold;
  for (const guide of guides) {
    const nextDistance = Math.abs(value - guide);
    if (nextDistance > distance) {
      continue;
    }
    closest = guide;
    distance = nextDistance;
  }
  return closest;
}

export function snapImagePoint(
  point: { x: number; y: number },
  threshold = CROP_SNAP_THRESHOLD,
) {
  const clamped = clampImagePoint(point);
  const guides = [0, 0.5, 1] as const;
  return {
    x: snapValue(clamped.x, guides, threshold),
    y: snapValue(clamped.y, guides, threshold),
  };
}

export function snapCrop(
  crop: ImageCrop,
  threshold = CROP_SNAP_THRESHOLD,
): ImageCrop {
  return {
    ...crop,
    x: snapValue(crop.x, [0, (1 - crop.w) / 2, 1 - crop.w], threshold),
    y: snapValue(crop.y, [0, (1 - crop.h) / 2, 1 - crop.h], threshold),
  };
}

export function nudgeCrop(
  crop: ImageCrop,
  dx: number,
  dy: number,
  dw = 0,
  dh = 0,
): ImageCrop {
  if (dw !== 0 || dh !== 0) {
    return {
      x: crop.x,
      y: crop.y,
      w: Math.min(1 - crop.x, Math.max(MIN_CROP, crop.w + dw)),
      h: Math.min(1 - crop.y, Math.max(MIN_CROP, crop.h + dh)),
    };
  }
  return {
    x: Math.min(Math.max(0, crop.x + dx), 1 - crop.w),
    y: Math.min(Math.max(0, crop.y + dy), 1 - crop.h),
    w: crop.w,
    h: crop.h,
  };
}

export type CropHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

export const CROP_HANDLES: ReadonlyArray<CropHandle> = [
  "n",
  "s",
  "e",
  "w",
  "nw",
  "ne",
  "sw",
  "se",
];

export function cropContains(
  crop: ImageCrop,
  point: { x: number; y: number },
): boolean {
  return (
    point.x >= crop.x &&
    point.x <= crop.x + crop.w &&
    point.y >= crop.y &&
    point.y <= crop.y + crop.h
  );
}

export function resizeCrop(
  origin: ImageCrop,
  handle: CropHandle,
  point: { x: number; y: number },
): ImageCrop {
  const right = origin.x + origin.w;
  const bottom = origin.y + origin.h;
  let x = origin.x;
  let y = origin.y;
  let w = origin.w;
  let h = origin.h;
  if (handle.includes("w")) {
    x = Math.min(Math.max(0, point.x), right - MIN_CROP);
    w = right - x;
  } else if (handle.includes("e")) {
    w = Math.min(1 - origin.x, Math.max(MIN_CROP, point.x - origin.x));
  }
  if (handle.includes("n")) {
    y = Math.min(Math.max(0, point.y), bottom - MIN_CROP);
    h = bottom - y;
  } else if (handle.includes("s")) {
    h = Math.min(1 - origin.y, Math.max(MIN_CROP, point.y - origin.y));
  }
  return { x, y, w, h };
}

export function lockCropAspect(crop: ImageCrop, ratio: number): ImageCrop {
  if (!Number.isFinite(ratio) || ratio <= 0) {
    return crop;
  }
  const next =
    crop.w / crop.h > ratio
      ? { ...crop, w: crop.h * ratio }
      : { ...crop, h: crop.w / ratio };
  return {
    x: clamp01(next.x),
    y: clamp01(next.y),
    w: Math.min(next.w, 1 - clamp01(next.x)),
    h: Math.min(next.h, 1 - clamp01(next.y)),
  };
}
