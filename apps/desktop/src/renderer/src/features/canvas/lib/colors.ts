import type { CanvasColor } from "@shared/canvas-contracts";

export const CANVAS_COLOR_LABELS = {
  white: "White",
  gray: "Gray",
  yellow: "Yellow",
  orange: "Orange",
  red: "Red",
  pink: "Pink",
  purple: "Purple",
  blue: "Blue",
  green: "Green",
} satisfies Record<CanvasColor, string>;

/** Palette dots. Light fills, so white and gray stay distinct from the ink. */
export const SWATCH = {
  white: "#ffffff",
  gray: "var(--ds-border-strong)",
  yellow: "var(--ds-yellow-border)",
  orange: "var(--ds-orange-border)",
  red: "var(--ds-red-border)",
  pink: "var(--ds-pink-border)",
  purple: "var(--ds-purple-border)",
  blue: "var(--ds-blue-border)",
  green: "var(--ds-green-border)",
} satisfies Record<CanvasColor, string>;

export const NOTE_FILL = {
  white: "#ffffff",
  gray: "var(--ds-border-strong)",
  yellow: "var(--ds-yellow-tint)",
  orange: "var(--ds-orange-tint)",
  red: "var(--ds-red-tint)",
  pink: "var(--ds-pink-tint)",
  purple: "var(--ds-purple-tint)",
  blue: "var(--ds-blue-tint)",
  green: "var(--ds-green-tint)",
} satisfies Record<CanvasColor, string>;

export const FIGURE_EDGE = {
  white: "var(--ds-border-strong)",
  gray: "var(--ds-foreground-tertiary)",
  yellow: "var(--ds-yellow-border)",
  orange: "var(--ds-orange-border)",
  red: "var(--ds-red-border)",
  pink: "var(--ds-pink-border)",
  purple: "var(--ds-purple-border)",
  blue: "var(--ds-blue-border)",
  green: "var(--ds-green-border)",
} satisfies Record<CanvasColor, string>;

export const INK = {
  white: "#ffffff",
  gray: "var(--ds-foreground-primary)",
  yellow: "var(--ds-yellow)",
  orange: "var(--ds-orange)",
  red: "var(--ds-red)",
  pink: "var(--ds-pink)",
  purple: "var(--ds-purple)",
  blue: "var(--ds-blue)",
  green: "var(--ds-green)",
} satisfies Record<CanvasColor, string>;
