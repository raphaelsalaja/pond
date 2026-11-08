import { clsx as cn } from "clsx";
import type { CSSProperties } from "react";
import type { StoryboardTile } from "../lib/range";
import styles from "./styles.module.css";

interface FrameProps extends React.ComponentPropsWithoutRef<"span"> {
  tile?: StoryboardTile | null;
  src?: string | null;
}

function percent(index: number, count: number): string {
  return count > 1 ? `${(index / (count - 1)) * 100}%` : "0%";
}

/** One storyboard cell, or a plain image, cropped to cover its box. */
export function Frame({ tile, src, className, ...props }: FrameProps) {
  if (tile) {
    const style: CSSProperties & { "--aspect": number } = {
      "--aspect": tile.aspect,
      backgroundImage: `url("${tile.url}")`,
      backgroundSize: `${tile.columns * 100}% ${tile.rows * 100}%`,
      backgroundPosition: `${percent(tile.column, tile.columns)} ${percent(tile.row, tile.rows)}`,
    };
    return (
      <span className={cn(styles.frame, className)} {...props}>
        <span className={styles.sprite} style={style} />
      </span>
    );
  }
  return (
    <span
      className={cn(styles.frame, className)}
      data-empty={src ? undefined : ""}
      {...props}
    >
      {src ? (
        <img className={styles.image} src={src} alt="" draggable={false} />
      ) : null}
    </span>
  );
}
