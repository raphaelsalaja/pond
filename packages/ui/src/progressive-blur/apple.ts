/**
 * The iOS 27 soft scroll edge, read from the Simulator's layer tree and fitted to its screenshots.
 * @see https://www.raphaelsalaja.com/work/progressive-blur
 */

/** Apple's mask at 11 even steps, from the bar (1) to the content (0). */
export const CURVE = [
  1, 0.9804, 0.9239, 0.829, 0.6957, 0.5373, 0.3749, 0.2259, 0.1114, 0.0361, 0,
] as const;

/** Sharp blur standard deviation in px against the mask; it holds near 0.5px until the mask is almost 0. */
export const SHARP = [
  [0, 0],
  [0.025, 0.37],
  [0.05, 0.5],
  [0.1, 0.6],
  [0.2, 0.84],
  [0.3, 1.08],
  [0.4, 1.26],
  [0.5, 1.42],
  [0.6, 1.61],
  [0.7, 1.95],
  [0.8, 2.27],
  [0.9, 2.56],
  [1, 2.88],
] as const;

export interface Recipe {
  /** Wide blur standard deviation in px, blended over the sharp one. */
  fill: number;
  normal: number;
  lighten: number;
  darken: number;
  /** Background opacity painted under both blurs where the mask is 1. */
  veil: number;
}

export const SOFT = {
  light: { fill: 29.6, normal: 0.25, lighten: 0.6, darken: 0.4, veil: 0.5 },
  dark: { fill: 29.6, normal: 0, lighten: 0.4, darken: 0.6, veil: 0.6 },
} satisfies Record<"light" | "dark", Recipe>;

/** Where the mask leaves 1 and reaches 0, as fractions of the edge. */
export const TOP = { start: 0.34, end: 0.97 };
export const BOTTOM = { start: 0, end: 0.954 };
