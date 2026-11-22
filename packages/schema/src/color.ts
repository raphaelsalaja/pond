import {
  CONTRAST_DEFAULT,
  CONTRAST_MAX,
  CONTRAST_MIN,
  type ThemeDef,
} from "./prefs.types";

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function parseHex(hex: string): [number, number, number] | null {
  const normalized = normalizeHex(hex);
  if (!normalized) return null;
  const int = Number.parseInt(normalized.slice(1), 16);
  return [(int >> 16) & 0xff, (int >> 8) & 0xff, int & 0xff];
}

export function normalizeHex(input: string): string | null {
  const trimmed = input.trim().replace(/^#/, "");
  const expanded =
    trimmed.length === 3
      ? trimmed
          .split("")
          .map((ch) => ch + ch)
          .join("")
      : trimmed;
  return /^[0-9a-f]{6}$/i.test(expanded) ? `#${expanded.toLowerCase()}` : null;
}

function srgbToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/**
 * sRGB hex to OKLCH.
 * @see https://bottosson.github.io/posts/oklab/
 */
export function hexToOklch(hex: string): Oklch | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const r = srgbToLinear(rgb[0]);
  const g = srgbToLinear(rgb[1]);
  const b = srgbToLinear(rgb[2]);

  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;

  const l_ = Math.cbrt(l);
  const m_ = Math.cbrt(m);
  const s_ = Math.cbrt(s);

  const okL = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const okA = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const okB = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;

  const c = Math.hypot(okA, okB);
  const h = c < 1e-4 ? 0 : ((Math.atan2(okB, okA) * 180) / Math.PI + 360) % 360;
  return { l: okL, c, h };
}

export interface NormalizedTheme extends ThemeDef {
  mode: "light" | "dark";
}

/** Stored prefs may hold hand-edited colors, so every painter reads this cleaned copy. */
export function normalizeTheme(def: ThemeDef): NormalizedTheme {
  const background = normalizeHex(def?.background ?? "") ?? "#ffffff";
  const foreground = normalizeHex(def?.foreground ?? "") ?? "#1b1b1b";
  const accent = normalizeHex(def?.accent ?? "") ?? "#5e6ad2";
  const contrast = Number.isFinite(def?.contrast)
    ? clamp(def.contrast, CONTRAST_MIN, CONTRAST_MAX)
    : CONTRAST_DEFAULT;
  const bgL = hexToOklch(background)?.l ?? 1;
  const fgL = hexToOklch(foreground)?.l ?? 0;
  return {
    background,
    foreground,
    accent,
    contrast,
    mode: bgL < fgL ? "dark" : "light",
  };
}
