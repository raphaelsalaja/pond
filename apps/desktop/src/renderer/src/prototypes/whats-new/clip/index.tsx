import { clsx as cn } from "clsx";
import { clip, poster } from "../fixture";
import styles from "./styles.module.css";

interface ClipProps extends React.ComponentPropsWithoutRef<"video"> {
  fit?: "cover" | "contain";
}

export function Clip({ className, fit = "cover", ...props }: ClipProps) {
  return (
    <video
      className={cn(styles.clip, className)}
      data-fit={fit}
      src={clip}
      poster={poster}
      autoPlay
      muted
      loop
      playsInline
      aria-hidden
      {...props}
    />
  );
}
