import { clsx as cn } from "clsx";
import { type ComponentPropsWithoutRef, useRef } from "react";
import styles from "./styles.module.css";
import { useGlow } from "./use-glow";

export function Spotlight({
  className,
  ...props
}: ComponentPropsWithoutRef<"canvas">) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useGlow(canvas);
  return (
    <canvas ref={canvas} className={cn(styles.canvas, className)} {...props} />
  );
}
