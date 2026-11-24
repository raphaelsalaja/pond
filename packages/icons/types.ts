import type { FunctionComponent, SVGProps } from "react";

/** The stroke is part of the drawing, so callers can't override it. */
export interface IconProps
  extends Omit<SVGProps<SVGSVGElement>, "strokeWidth"> {
  /** Rendered width and height. Numbers are pixels. */
  size?: number | string;
  title?: string;
}

export type IconStyle = "outline" | "fill";

export type IconNode = readonly (readonly [
  string,
  Readonly<Record<string, string>>,
])[];

export type IconComponent = FunctionComponent<IconProps> & {
  /** The drawing behind a generated glyph, so its shapes can morph into another glyph's. */
  glyph?: { style: IconStyle; nodes: IconNode };
};
