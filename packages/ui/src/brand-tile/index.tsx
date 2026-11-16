import { clsx as cn } from "clsx";
import type { ComponentPropsWithoutRef } from "react";
import styles from "./styles.module.css";

interface BrandTileProps extends ComponentPropsWithoutRef<"span"> {
  size?: number;
  rounding?: "rounded" | "full";
}

export function BrandTile({
  size = 36,
  rounding = "rounded",
  className,
  style,
  ...props
}: BrandTileProps) {
  return (
    <span
      aria-hidden
      className={cn(styles.root, className)}
      data-rounding={rounding}
      style={{ width: size, height: size, ...style }}
      {...props}
    />
  );
}
