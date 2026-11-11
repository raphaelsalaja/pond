export const LOGO_SIZE = 256;
export const MAX_LOGO_ZOOM = 4;

export interface ImageSize {
  width: number;
  height: number;
}

/** An image picked for a logo, sized in the pixels the crop is measured in. */
export interface LogoSource extends ImageSize {
  src: string;
}

/** Where the square crop sits: `zoom` 1 fits the short side, and the center is in image pixels. */
export interface LogoFrame {
  zoom: number;
  centerX: number;
  centerY: number;
}

/** A square region of the image, in image pixels. */
export interface LogoCrop {
  x: number;
  y: number;
  size: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function side(image: ImageSize, zoom: number): number {
  return Math.min(image.width, image.height) / zoom;
}

export function centeredFrame(image: ImageSize): LogoFrame {
  return { zoom: 1, centerX: image.width / 2, centerY: image.height / 2 };
}

/** Keeps the crop square inside the image so the logo never shows empty space. */
export function clampFrame(image: ImageSize, frame: LogoFrame): LogoFrame {
  const zoom = clamp(
    Number.isFinite(frame.zoom) ? frame.zoom : 1,
    1,
    MAX_LOGO_ZOOM,
  );
  const half = side(image, zoom) / 2;
  return {
    zoom,
    centerX: clamp(frame.centerX, half, image.width - half),
    centerY: clamp(frame.centerY, half, image.height - half),
  };
}

export function cropRect(image: ImageSize, frame: LogoFrame): LogoCrop {
  const clamped = clampFrame(image, frame);
  const size = side(image, clamped.zoom);
  return {
    x: clamped.centerX - size / 2,
    y: clamped.centerY - size / 2,
    size,
  };
}

/** Moves the image with the pointer: dragging right shows more of the left side. */
export function panFrame(
  image: ImageSize,
  frame: LogoFrame,
  delta: { x: number; y: number },
  viewport: number,
): LogoFrame {
  const pixels = side(image, clampFrame(image, frame).zoom) / viewport;
  return clampFrame(image, {
    ...frame,
    centerX: frame.centerX - delta.x * pixels,
    centerY: frame.centerY - delta.y * pixels,
  });
}

export function zoomFrame(
  image: ImageSize,
  frame: LogoFrame,
  zoom: number,
): LogoFrame {
  return clampFrame(image, { ...frame, zoom });
}

/** Whole pixels inside the image, for decoders that reject fractional or out-of-bounds rects. */
export function pixelCrop(image: ImageSize, crop: LogoCrop): LogoCrop {
  const limit = Math.max(1, Math.floor(Math.min(image.width, image.height)));
  const size = clamp(Math.round(crop.size) || limit, 1, limit);
  return {
    x: clamp(Math.round(crop.x) || 0, 0, Math.floor(image.width) - size),
    y: clamp(Math.round(crop.y) || 0, 0, Math.floor(image.height) - size),
    size,
  };
}

/** Lays the whole image out so `crop` fills a square of `viewport` pixels. */
export function cropPlacement(
  image: ImageSize,
  crop: LogoCrop,
  viewport: number,
) {
  const scale = viewport / crop.size;
  return {
    width: image.width * scale,
    height: image.height * scale,
    x: -crop.x * scale,
    y: -crop.y * scale,
  };
}
