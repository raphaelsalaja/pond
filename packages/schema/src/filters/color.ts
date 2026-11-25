import { z } from "zod";
import type { PredicateValue } from "./types";

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return null;
  const n = Number.parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export const DEFAULT_COLOR_TOLERANCE = 60;

const ColorMatch = z.union([
  z.string().transform((hex) => ({ hex, tolerance: DEFAULT_COLOR_TOLERANCE })),
  z.object({
    hex: z.string(),
    tolerance: z
      .number()
      .finite()
      .min(0)
      .max(150)
      .default(DEFAULT_COLOR_TOLERANCE),
  }),
]);

export function readColorMatch(
  value: PredicateValue | { hex: string; tolerance?: number } | undefined,
): { hex: string; tolerance: number } | null {
  const parsed = ColorMatch.safeParse(value);
  if (!parsed.success || !parseHex(parsed.data.hex)) return null;
  return {
    hex: `#${parsed.data.hex.trim().replace(/^#/, "").toLowerCase()}`,
    tolerance: parsed.data.tolerance,
  };
}

export function colorNear(
  targetHex: string,
  palette: ReadonlyArray<string>,
  tolerance = DEFAULT_COLOR_TOLERANCE,
): boolean {
  const target = parseHex(targetHex);
  if (!target) return false;
  const tol2 = tolerance * tolerance;
  for (const hex of palette) {
    const c = parseHex(hex);
    if (!c) continue;
    const dr = c.r - target.r;
    const dg = c.g - target.g;
    const db = c.b - target.b;
    if (dr * dr + dg * dg + db * db <= tol2) return true;
  }
  return false;
}

export const COLOR_PRESETS: ReadonlyArray<{ label: string; hex: string }> = [
  { label: "Black", hex: "#111111" },
  { label: "White", hex: "#ffffff" },
  { label: "Gray", hex: "#9e9e9e" },
  { label: "Brown", hex: "#a48057" },
  { label: "Pink", hex: "#fc85b3" },
  { label: "Red", hex: "#ff2727" },
  { label: "Orange", hex: "#ffa34b" },
  { label: "Yellow", hex: "#ffd534" },
  { label: "Green", hex: "#47c595" },
  { label: "Teal", hex: "#51c4c4" },
  { label: "Blue", hex: "#2b76e7" },
  { label: "Purple", hex: "#6d50ed" },
];
