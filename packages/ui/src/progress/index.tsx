import { Progress as Base } from "@base-ui/react/progress";
import { clsx as cn } from "clsx";
import styles from "./styles.module.css";

interface RootProps extends Base.Root.Props {
  size?: "sm" | "md";
}

function Root({ className, size = "sm", ...props }: RootProps) {
  return (
    <Base.Root
      className={cn(styles.root, className)}
      data-size={size}
      {...props}
    />
  );
}

function Track({ className, ...props }: Base.Track.Props) {
  return <Base.Track className={cn(styles.track, className)} {...props} />;
}

function Indicator({ className, ...props }: Base.Indicator.Props) {
  return (
    <Base.Indicator className={cn(styles.indicator, className)} {...props} />
  );
}

function Label({ className, ...props }: Base.Label.Props) {
  return <Base.Label className={cn(styles.label, className)} {...props} />;
}

function Value({ className, ...props }: Base.Value.Props) {
  return <Base.Value className={cn(styles.value, className)} {...props} />;
}

export const Progress = { Root, Track, Indicator, Label, Value };
