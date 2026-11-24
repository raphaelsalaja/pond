import { createElement } from "react";
import type { IconComponent, IconNode, IconProps, IconStyle } from "./types";

const GRID = 18;
/** On-screen stroke at every size up to the grid, matched to Linear's line weight. */
const STROKE = 1.25;

/** Glyph size within its box; the viewBox grows around the center so every drawing shrinks without editing its paths. */
const GLYPH_SCALE = 1;
const VIEW = Number((GRID / GLYPH_SCALE).toFixed(3));
const ORIGIN = Number(((GRID - VIEW) / 2).toFixed(3));
const VIEW_BOX = `${ORIGIN} ${ORIGIN} ${VIEW} ${VIEW}`;

/** Above the grid the stroke grows with the glyph; at or below it the stroke is screen pixels, even when CSS resizes the icon. */
function grows(size: number | string) {
  return Number(size) > GRID;
}

function strokeWidthFor(size: number | string) {
  return grows(size) ? STROKE / GLYPH_SCALE : STROKE;
}

/** Props every shape inside an icon frame needs so its stroke matches the drawn glyphs. */
export function iconShapeProps(variant: IconStyle, size: number | string = GRID) {
  return variant !== "fill" && !grows(size)
    ? { vectorEffect: "non-scaling-stroke" }
    : null;
}

interface IconFrameProps extends IconProps {
  variant: IconStyle;
}

/** The svg box and paint shared by every glyph, for drawing shapes that aren't a fixed glyph. */
export function IconFrame({
  variant,
  size = GRID,
  title,
  children,
  ...props
}: IconFrameProps) {
  const paint =
    variant === "outline"
      ? {
          fill: "none",
          stroke: "currentColor",
          strokeLinecap: "round" as const,
          strokeLinejoin: "round" as const,
          strokeWidth: strokeWidthFor(size),
        }
      : { fill: "currentColor" };
  return createElement(
    "svg",
    {
      "aria-hidden": title ? undefined : true,
      height: size,
      role: title ? "img" : undefined,
      viewBox: VIEW_BOX,
      width: size,
      xmlns: "http://www.w3.org/2000/svg",
      ...paint,
      ...props,
    },
    title ? createElement("title", null, title) : null,
    children,
  );
}

export function createIcon(
  glyph: string,
  style: IconStyle,
  nodes: IconNode,
): IconComponent {
  // biome-ignore lint/correctness/noComponentHookFactories: each generated icon module calls createIcon once at load.
  function Icon({ size = GRID, children: extra, ...props }: IconProps) {
    const fixed = iconShapeProps(style, size);
    return createElement(
      IconFrame,
      { variant: style, size, ...props },
      ...nodes.map(([tag, attrs], index) =>
        createElement(tag, { key: index, ...fixed, ...attrs }),
      ),
      extra,
    );
  }
  Icon.displayName = `Icon${glyph}`;
  return Object.assign(Icon, { glyph: { style, nodes } });
}
