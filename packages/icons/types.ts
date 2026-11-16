import type { FunctionComponent, SVGProps } from "react";

export interface IconProps extends SVGProps<SVGSVGElement> {
  /** Rendered width and height. Numbers are pixels. */
  size?: number | string;
  /** On-screen stroke in pixels for line glyphs at 18px and below; scales with the glyph above 18px. Defaults thinner below 18px. */
  strokeWidth?: number | string;
  title?: string;
}

export type IconComponent = FunctionComponent<IconProps>;

export type IconStyle = "outline" | "fill";

export type IconNode = readonly (readonly [
  string,
  Readonly<Record<string, string>>,
])[];
