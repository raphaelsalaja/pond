import { createElement } from "react";
import type { IconComponent, IconNode, IconProps, IconStyle } from "./types";

const GRID = 18;
const STROKE = 1.7;

/** Default stroke below the grid thins by the square root of the scale, so small glyphs lighten without going spindly. */
function defaultStroke(rendered: number) {
  if (!(rendered > 0) || rendered >= GRID) return STROKE;
  return Math.max(1, STROKE * Math.sqrt(rendered / GRID));
}

/** Converts on-screen pixels at `size` to viewBox units: held up to the 18px grid, then grown with the glyph. */
function strokeUnits(
  stroke: number | string | undefined,
  size: number | string,
) {
  const rendered = Number(size);
  const explicit = stroke === undefined ? Number.NaN : Number(stroke);
  const pixels = Number.isFinite(explicit) ? explicit : defaultStroke(rendered);
  if (!(rendered > 0) || rendered > GRID) return pixels;
  return (pixels * GRID) / rendered;
}

export function createIcon(
  glyph: string,
  style: IconStyle,
  nodes: IconNode,
): IconComponent {
  // biome-ignore lint/correctness/noComponentHookFactories: each generated icon module calls createIcon once at load.
  function Icon({
    size = GRID,
    strokeWidth,
    title,
    children: extra,
    ...props
  }: IconProps) {
    const paint =
      style === "outline"
        ? {
            fill: "none",
            stroke: "currentColor",
            strokeLinecap: "round" as const,
            strokeLinejoin: "round" as const,
            strokeWidth: strokeUnits(strokeWidth, size),
          }
        : { fill: "currentColor" };
    return createElement(
      "svg",
      {
        "aria-hidden": title ? undefined : true,
        height: size,
        role: title ? "img" : undefined,
        viewBox: `0 0 ${GRID} ${GRID}`,
        width: size,
        xmlns: "http://www.w3.org/2000/svg",
        ...paint,
        ...props,
      },
      title ? createElement("title", null, title) : null,
      ...nodes.map(([tag, attrs], index) =>
        createElement(tag, { key: index, ...attrs }),
      ),
      extra,
    );
  }
  Icon.displayName = `Icon${glyph}`;
  return Icon;
}
