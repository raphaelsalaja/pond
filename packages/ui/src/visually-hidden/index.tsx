import { clsx as cn } from "clsx";
import type { ComponentPropsWithoutRef } from "react";
import styles from "./styles.module.css";

type VisuallyHiddenProps = ComponentPropsWithoutRef<"span">;

export function VisuallyHidden({ className, ...props }: VisuallyHiddenProps) {
  return <span className={cn(styles.root, className)} {...props} />;
}
