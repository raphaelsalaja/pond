import { clsx as cn } from "clsx";
import type { ComponentPropsWithoutRef } from "react";
import styles from "./styles.module.css";

type HintProps = ComponentPropsWithoutRef<"div">;

export function Hint({ className, ...props }: HintProps) {
  return (
    <div role="status" className={cn(styles.hint, className)} {...props} />
  );
}
