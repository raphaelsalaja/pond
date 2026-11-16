export const CANVAS_COLORS = [
  "gray",
  "yellow",
  "orange",
  "red",
  "pink",
  "purple",
  "blue",
  "green",
] as const;

export type CanvasColor = (typeof CANVAS_COLORS)[number];

export const NOTE_FILL = {
  gray: "var(--ds-background-tertiary)",
  yellow: "var(--ds-yellow-tint)",
  orange: "var(--ds-orange-tint)",
  red: "var(--ds-red-tint)",
  pink: "var(--ds-pink-tint)",
  purple: "var(--ds-purple-tint)",
  blue: "var(--ds-blue-tint)",
  green: "var(--ds-green-tint)",
} satisfies Record<CanvasColor, string>;

export const INK = {
  gray: "var(--ds-foreground-primary)",
  yellow: "var(--ds-yellow)",
  orange: "var(--ds-orange)",
  red: "var(--ds-red)",
  pink: "var(--ds-pink)",
  purple: "var(--ds-purple)",
  blue: "var(--ds-blue)",
  green: "var(--ds-green)",
} satisfies Record<CanvasColor, string>;
