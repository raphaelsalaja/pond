import { Slider as Base } from "@base-ui/react/slider";
import { clsx as cn } from "clsx";
import type { ComponentPropsWithoutRef, ReactNode } from "react";
import styles from "./styles.module.css";

interface RootProps extends Base.Root.Props {
  /** `stacked` puts the label above the track and `Slider.Bounds` below it. `field` draws `Slider.Label` and `Slider.Value` inside the control; a label placed before the control sits beside it. */
  layout?: "inline" | "stacked" | "field";
  /** `accent` fills the indicator with the accent color. */
  tone?: "neutral" | "accent";
}

function Root({
  className,
  layout = "inline",
  tone = "neutral",
  thumbAlignment = "edge",
  ...props
}: RootProps) {
  return (
    <Base.Root
      className={cn(styles.root, className)}
      data-layout={layout === "inline" ? undefined : layout}
      data-tone={tone === "neutral" ? undefined : tone}
      thumbAlignment={thumbAlignment}
      {...props}
    />
  );
}

function Label({ className, ...props }: Base.Label.Props) {
  return <Base.Label className={cn(styles.label, className)} {...props} />;
}

function Value({ className, ...props }: Base.Value.Props) {
  return <Base.Value className={cn(styles.value, className)} {...props} />;
}

function Control({ className, ...props }: Base.Control.Props) {
  return <Base.Control className={cn(styles.control, className)} {...props} />;
}

function Track({ className, ...props }: Base.Track.Props) {
  return <Base.Track className={cn(styles.track, className)} {...props} />;
}

interface ThumbProps extends Base.Thumb.Props {
  /** Shows the thumb's value in a badge under it. */
  badge?: boolean;
}

function Thumb({ className, badge, index, children, ...props }: ThumbProps) {
  return (
    <Base.Thumb
      className={cn(styles.thumb, className)}
      index={index}
      {...props}
    >
      {children}
      {badge ? (
        <span aria-hidden className={styles.badge}>
          <Base.Value>{(formatted) => formatted[index ?? 0]}</Base.Value>
        </span>
      ) : null}
    </Base.Thumb>
  );
}

interface BoundsProps extends ComponentPropsWithoutRef<"div"> {
  min: ReactNode;
  max: ReactNode;
}

function Bounds({ className, min, max, ...props }: BoundsProps) {
  return (
    <div aria-hidden className={cn(styles.bounds, className)} {...props}>
      <span>{min}</span>
      <span>{max}</span>
    </div>
  );
}

function Indicator({ className, ...props }: Base.Indicator.Props) {
  return (
    <Base.Indicator className={cn(styles.indicator, className)} {...props} />
  );
}

export const Slider = {
  Root,
  Label,
  Value,
  Control,
  Track,
  Thumb,
  Indicator,
  Bounds,
};
