import { normalizeHex } from "@pond/schema/color";

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(input: string): { rgb: Rgb; hex: string } | null {
  const hex = normalizeHex(input);
  if (!hex) return null;
  const int = Number.parseInt(hex.slice(1), 16);
  return {
    hex,
    rgb: {
      r: (int >> 16) & 0xff,
      g: (int >> 8) & 0xff,
      b: int & 0xff,
    },
  };
}

function hue(
  r: number,
  g: number,
  b: number,
  max: number,
  delta: number,
): number {
  if (delta === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;
  h = Math.round(h * 60);
  return h < 0 ? h + 360 : h;
}

function toHsl({ r, g, b }: Rgb): string {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;
  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return `hsl(${hue(rr, gg, bb, max, delta)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

function toHsv({ r, g, b }: Rgb): string {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;
  const s = max === 0 ? 0 : delta / max;
  return `hsv(${hue(rr, gg, bb, max, delta)}, ${Math.round(s * 100)}%, ${Math.round(max * 100)}%)`;
}

function toHwb({ r, g, b }: Rgb): string {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;
  return `hwb(${hue(rr, gg, bb, max, delta)}, ${Math.round(min * 100)}%, ${Math.round((1 - max) * 100)}%)`;
}

function toCmyk({ r, g, b }: Rgb): string {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const k = 1 - Math.max(rr, gg, bb);
  const f = (v: number) => (k === 1 ? 0 : (1 - v - k) / (1 - k));
  return `cmyk(${Math.round(f(rr) * 100)}%, ${Math.round(f(gg) * 100)}%, ${Math.round(f(bb) * 100)}%, ${Math.round(k * 100)}%)`;
}

interface ColorFormat {
  label: string;
  value: string;
}

export function colorCopyFormats(
  input: string,
): { primary: Array<ColorFormat>; secondary: Array<ColorFormat> } | null {
  const parsed = parseHex(input);
  if (!parsed) return null;
  const { rgb, hex } = parsed;
  return {
    primary: [
      { label: hex, value: hex },
      {
        label: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
        value: `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`,
      },
      {
        label: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`,
        value: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`,
      },
      { label: toHsl(rgb), value: toHsl(rgb) },
    ],
    secondary: [
      { label: toHsv(rgb), value: toHsv(rgb) },
      { label: toHwb(rgb), value: toHwb(rgb) },
      { label: toCmyk(rgb), value: toCmyk(rgb) },
    ],
  };
}
