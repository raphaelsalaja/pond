import { clsx as cn } from "clsx";
import type { ComponentPropsWithoutRef } from "react";
import styles from "./styles.module.css";

interface RootProps extends ComponentPropsWithoutRef<"div"> {
  layout?: "list" | "tiles" | "grid";
}

function Root({ className, layout = "list", ...props }: RootProps) {
  return (
    <div
      className={cn(styles.root, className)}
      data-layout={layout}
      {...props}
    />
  );
}

interface RowProps extends ComponentPropsWithoutRef<"div"> {
  span?: "full";
}

function Row({ className, span, ...props }: RowProps) {
  return (
    <div className={cn(styles.row, className)} data-span={span} {...props} />
  );
}

type LabelProps = ComponentPropsWithoutRef<"span">;

function Label({ className, ...props }: LabelProps) {
  return <span className={cn(styles.label, className)} {...props} />;
}

type ValueProps = ComponentPropsWithoutRef<"span">;

function Value({ className, ...props }: ValueProps) {
  return <span className={cn(styles.value, className)} {...props} />;
}

export const PropertyList = { Root, Row, Label, Value };
