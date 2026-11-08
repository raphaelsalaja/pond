import {
  IconMediaFastBackwardsFill,
  IconMediaFastForwardFill,
  IconMediaPauseFill,
  IconMediaPlayFill,
} from "@pond/icons";
import { Button } from "@pond/ui";
import { clsx as cn } from "clsx";
import type { ReactNode } from "react";
import type { Clip } from "../lib/clip";
import type { Player } from "../lib/player";
import { formatClock } from "../lib/range";
import styles from "./styles.module.css";

interface TransportProps extends React.ComponentPropsWithoutRef<"div"> {
  clip: Clip;
  player: Player;
  aside?: ReactNode;
}

/** Time, start and end jumps around play, and an optional trailing slot. */
export function Transport({
  clip,
  player,
  aside,
  className,
  ...props
}: TransportProps) {
  const { range, duration } = clip;
  return (
    <div className={cn(styles.transport, className)} {...props}>
      <span className={styles.clock}>
        {formatClock(player.time)}
        <span className={styles.total}> / {formatClock(duration)}</span>
      </span>
      <div className={styles.buttons}>
        <Button
          icon
          size="sm"
          variant="ghost"
          aria-label="Go to Start"
          onClick={() => player.seek(range.start)}
        >
          <IconMediaFastBackwardsFill size={16} />
        </Button>
        {player.playable ? (
          <Button
            icon
            size="md"
            variant="ghost"
            aria-label={player.playing ? "Pause" : "Play"}
            onClick={player.toggle}
          >
            {player.playing ? <IconMediaPauseFill /> : <IconMediaPlayFill />}
          </Button>
        ) : null}
        <Button
          icon
          size="sm"
          variant="ghost"
          aria-label="Go to End"
          onClick={() => player.seek(range.end)}
        >
          <IconMediaFastForwardFill size={16} />
        </Button>
      </div>
      <div className={styles.aside}>{aside}</div>
    </div>
  );
}
