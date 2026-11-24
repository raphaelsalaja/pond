import { clsx as cn } from "clsx";
import { useLayoutEffect, useRef } from "react";
import { progressiveBlur } from "./core";
import type { ProgressiveBlurOptions } from "./core";
import styles from "./styles.module.css";

export type { ProgressiveBlurOptions, Side, Technique } from "./core";

interface ProgressiveBlurProps
  extends
    ProgressiveBlurOptions,
    Omit<React.ComponentPropsWithoutRef<"div">, "children" | "color"> {}

/** An empty layer that blurs and fades what scrolls behind it. Position and size it over the content. */
export function ProgressiveBlur({
  side,
  color,
  scheme,
  start,
  end,
  technique,
  className,
  ...props
}: ProgressiveBlurProps) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!ref.current) {
      return;
    }
    return progressiveBlur(ref.current, {
      side,
      color,
      scheme,
      start,
      end,
      technique,
    });
  }, [side, color, scheme, start, end, technique]);

  return (
    <div
      aria-hidden
      className={cn(styles.root, className)}
      data-side={side ?? "top"}
      {...props}
      ref={ref}
    />
  );
}
