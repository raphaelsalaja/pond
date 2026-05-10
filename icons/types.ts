import type { ComponentType } from "react";

/**
 * Structural type for any icon component shipped through `@pond/icons`.
 *
 * Nucleo's per-icon prop types narrow some SVG attributes (`strokeWidth`
 * is `number` only on outline icons), which means a Nucleo icon is
 * NOT directly assignable to React's `ComponentType<SVGProps<...>>`.
 * We dodge the variance trap by typing the slot as "a component that
 * accepts the props we actually pass in app code" — `width`, `height`,
 * `className`, and `aria-hidden`. Consumers that need more (e.g.
 * `strokeWidth`) should use the concrete icon type at the point of
 * use instead of going through this lowest-common-denominator type.
 */
export type IconComponent = ComponentType<{
  width?: number | string;
  height?: number | string;
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;
