import sharp from "sharp";

const SIZE = 1024;
/** Pond's app icon blue, sampled from the middle of `build/icon.png`. */
const POND_BLUE = { hue: 209 / 360, saturation: 0.63, value: 1 };
/** Middle of the folder's front face; its shading runs lighter above and darker below. */
const FACE_SAMPLE = { x: 512, y: 500 };
const MARK_SIDE = 324;
const MARK_CENTER = { x: 512, y: 574 };

type Hsv = [hue: number, saturation: number, value: number];

function toHsv(r: number, g: number, b: number): Hsv {
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let hue = 0;
  if (delta > 0) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue = (hue / 6 + 1) % 1;
  }
  return [hue, max === 0 ? 0 : delta / max, max];
}

function toRgb(hue: number, saturation: number, value: number) {
  const sector = Math.floor(hue * 6);
  const f = hue * 6 - sector;
  const p = value * (1 - saturation);
  const q = value * (1 - f * saturation);
  const t = value * (1 - (1 - f) * saturation);
  const table = [
    [value, t, p],
    [q, value, p],
    [p, value, t],
    [p, q, value],
    [t, p, value],
    [value, p, q],
  ] as const;
  return table[((sector % 6) + 6) % 6] ?? table[0];
}

function hsvAt(pixels: Uint8Array, offset: number): Hsv {
  return toHsv(
    (pixels[offset] ?? 0) / 255,
    (pixels[offset + 1] ?? 0) / 255,
    (pixels[offset + 2] ?? 0) / 255,
  );
}

/** Moves the folder face to Pond blue and keeps the system folder's own shading. */
export function tintFolderPixels(pixels: Uint8Array, width: number): void {
  const [faceHue, faceSaturation, faceValue] = hsvAt(
    pixels,
    (FACE_SAMPLE.y * width + FACE_SAMPLE.x) * 4,
  );
  const hueShift = POND_BLUE.hue - faceHue;
  const saturationScale =
    faceSaturation > 0 ? POND_BLUE.saturation / faceSaturation : 1;
  const valueScale = faceValue > 0 ? POND_BLUE.value / faceValue : 1;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    const [hue, saturation, value] = hsvAt(pixels, i);
    const [r, g, b] = toRgb(
      (hue + hueShift + 1) % 1,
      Math.min(1, saturation * saturationScale),
      Math.min(1, value * valueScale),
    );
    pixels[i] = Math.round(r * 255);
    pixels[i + 1] = Math.round(g * 255);
    pixels[i + 2] = Math.round(b * 255);
  }
}

/** The white Pond mark with the app icon's fade and shadow, laid out on a 1024 canvas. */
export function markOverlay(markSvg: string): string {
  const path = /\sd="([^"]+)"/.exec(markSvg)?.[1];
  const box = /viewBox="0 0 ([\d.]+) [\d.]+"/.exec(markSvg)?.[1];
  if (!path || !box) throw new Error("The Pond mark SVG has no path to draw.");
  const scale = MARK_SIDE / Number(box);
  const x = MARK_CENTER.x - MARK_SIDE / 2;
  const y = MARK_CENTER.y - MARK_SIDE / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
<defs>
<linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#b3dbff"/></linearGradient>
<filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="11" flood-color="#0d479e" flood-opacity="0.28"/></filter>
</defs>
<g filter="url(#shadow)"><path transform="translate(${x} ${y}) scale(${scale})" fill-rule="evenodd" fill="url(#fade)" d="${path}"/></g>
</svg>`;
}

export async function renderLibraryFolderIcon(
  folderPng: Buffer,
  markSvg: string,
): Promise<Buffer> {
  const { data, info } = await sharp(folderPng)
    .resize(SIZE, SIZE)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  tintFolderPixels(data, info.width);
  return sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .composite([{ input: Buffer.from(markOverlay(markSvg)) }])
    .png()
    .toBuffer();
}
